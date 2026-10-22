import { QueryClient, QueryObserver } from '@tanstack/query-core'
import { BroadcastChannel } from 'broadcast-channel'
import { expect, it, onTestFinished, vi } from 'vitest'
import { queryKey } from '@tanstack/query-test-utils'
import { broadcastQueryClient } from '..'

it('should preserve an observed error when another client broadcasts an empty added state', async () => {
  const key = queryKey()
  const queryClient = new QueryClient()
  const senderClient = new QueryClient()
  const error = new Error('down')
  const queryFn = vi.fn<() => Promise<never>>().mockRejectedValue(error)
  const observer = new QueryObserver(queryClient, {
    queryKey: key,
    queryFn,
    retry: false,
  })
  const onChange = vi.fn<() => void>()
  const unsubscribe = observer.subscribe(onChange)
  onTestFinished(() => {
    unsubscribe()
    queryClient.clear()
    senderClient.clear()
  })

  await vi.waitFor(() => {
    expect(observer.getCurrentResult().isError).toBe(true)
  })
  const previousState = queryClient.getQueryState(key)!
  expect(previousState.data).toBeUndefined()
  expect(previousState.errorUpdatedAt).toBeGreaterThan(0)

  const broadcastChannel = JSON.stringify(queryKey())
  const stopReceiver = broadcastQueryClient({
    queryClient,
    broadcastChannel,
    options: { type: 'simulate' },
  })
  const stopSender = broadcastQueryClient({
    queryClient: senderClient,
    broadcastChannel,
    options: { type: 'simulate' },
  })
  onTestFinished(() => {
    stopReceiver()
    stopSender()
  })
  const postMessage = vi.spyOn(BroadcastChannel.prototype, 'postMessage')
  onChange.mockClear()

  senderClient.getQueryCache().build(senderClient, { queryKey: key })

  expect(postMessage).toHaveBeenCalledExactlyOnceWith({
    type: 'added',
    queryHash: JSON.stringify(key),
    queryKey: key,
    state: expect.objectContaining({
      status: 'pending',
      fetchStatus: 'idle',
      data: undefined,
      error: null,
      dataUpdatedAt: 0,
      errorUpdatedAt: 0,
    }),
  })
  // The simulate transport resolves only after delivering the message.
  await postMessage.mock.results[0]!.value

  expect(queryClient.getQueryState(key)).toBe(previousState)
  expect(observer.getCurrentResult()).toMatchObject({
    status: 'error',
    fetchStatus: 'idle',
    error,
    isPending: false,
    isLoading: false,
  })
  expect(onChange).not.toHaveBeenCalled()
  expect(queryFn).toHaveBeenCalledTimes(1)
})
