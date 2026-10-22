import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSignal } from 'solid-js'
import { fireEvent } from '@solidjs/testing-library'
import { queryKey, sleep } from '@tanstack/query-test-utils'
import { reconcile } from 'solid-js/store'
import { QueryClient, useInfiniteQuery, useQuery } from '..'
import { renderWithClient } from './utils'
import type { InfiniteData } from '..'

type Reconciler<T> = (oldData: T | undefined, newData: T) => T

describe('reconciliation', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.useFakeTimers()
    queryClient = new QueryClient()
  })

  afterEach(() => {
    queryClient.clear()
    vi.useRealTimers()
  })

  it('should reconcile new data once and preserve its output on status updates', async () => {
    const key = queryKey()
    let count = 0
    let fail = false
    const reconcileData = vi.fn<Reconciler<{ count: number }>>(
      (_oldData, newData) => ({ count: newData.count * 10 }),
    )

    function Page() {
      const [staleTime, setStaleTime] = createSignal(0)
      const state = useQuery(() => ({
        queryKey: key,
        queryFn: async () => {
          await sleep(10)
          if (fail) throw new Error('refetch failed')
          return { count: ++count }
        },
        reconcile: reconcileData,
        staleTime: staleTime(),
        retry: false,
      }))

      return (
        <>
          <div>data: {state.data?.count}</div>
          <div>fetching: {String(state.isFetching)}</div>
          <div>status: {state.status}</div>
          <button onClick={() => state.refetch()}>refetch</button>
          <button onClick={() => setStaleTime(Infinity)}>keep fresh</button>
        </>
      )
    }

    const rendered = renderWithClient(queryClient, () => <Page />)

    expect(reconcileData).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10)
    expect(rendered.getByText('data: 10')).toBeInTheDocument()
    expect(reconcileData).toHaveBeenCalledExactlyOnceWith(undefined, {
      count: 1,
    })

    fireEvent.click(rendered.getByRole('button', { name: 'keep fresh' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(rendered.getByText('data: 10')).toBeInTheDocument()
    expect(reconcileData).toHaveBeenCalledTimes(1)

    fireEvent.click(rendered.getByRole('button', { name: 'refetch' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(rendered.getByText('fetching: true')).toBeInTheDocument()
    expect(rendered.getByText('data: 10')).toBeInTheDocument()
    expect(reconcileData).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10)
    expect(rendered.getByText('data: 20')).toBeInTheDocument()
    expect(reconcileData).toHaveBeenCalledTimes(2)
    expect(reconcileData).toHaveBeenLastCalledWith({ count: 10 }, { count: 2 })

    fail = true
    fireEvent.click(rendered.getByRole('button', { name: 'refetch' }))
    await vi.advanceTimersByTimeAsync(10)
    expect(rendered.getByText('status: error')).toBeInTheDocument()
    expect(rendered.getByText('fetching: false')).toBeInTheDocument()
    expect(rendered.getByText('data: 20')).toBeInTheDocument()
    expect(reconcileData).toHaveBeenCalledTimes(2)
  })

  it('should not reconcile loading or error results without data', async () => {
    const key = queryKey()
    const reconcileData = vi.fn<Reconciler<string>>((_oldData, data) => data)

    function Page() {
      const state = useQuery(() => ({
        queryKey: key,
        queryFn: async () => {
          await sleep(10)
          throw new Error('fetch failed')
        },
        reconcile: reconcileData,
        retry: false,
      }))
      return <div>status: {state.status}</div>
    }

    const rendered = renderWithClient(queryClient, () => <Page />)
    await vi.advanceTimersByTimeAsync(10)

    expect(rendered.getByText('status: error')).toBeInTheDocument()
    expect(reconcileData).not.toHaveBeenCalled()
  })

  it('should reuse reconciled data when a refetch returns the same data', async () => {
    const key = queryKey()
    const data = { value: 'fetched' }
    const reconcileData = vi.fn<Reconciler<typeof data>>(
      (_oldData, newData) => ({ value: `reconciled ${newData.value}` }),
    )

    function Page() {
      const state = useQuery(() => ({
        queryKey: key,
        queryFn: () => sleep(10).then(() => data),
        reconcile: reconcileData,
      }))

      return (
        <>
          <div>data: {state.data?.value}</div>
          <button onClick={() => state.refetch()}>refetch</button>
        </>
      )
    }

    const rendered = renderWithClient(queryClient, () => <Page />)
    await vi.advanceTimersByTimeAsync(10)
    expect(reconcileData).toHaveBeenCalledTimes(1)

    fireEvent.click(rendered.getByRole('button', { name: 'refetch' }))
    await vi.advanceTimersByTimeAsync(10)
    expect(rendered.getByText('data: reconciled fetched')).toBeInTheDocument()
    expect(reconcileData).toHaveBeenCalledTimes(1)

    queryClient.setQueryData(key, { value: 'updated' })
    await vi.advanceTimersByTimeAsync(0)
    expect(rendered.getByText('data: reconciled updated')).toBeInTheDocument()
    expect(reconcileData).toHaveBeenCalledTimes(2)
    expect(reconcileData).toHaveBeenLastCalledWith(
      { value: 'reconciled fetched' },
      { value: 'updated' },
    )
  })

  it('should reconcile selected data when it changes without a request', async () => {
    const key = queryKey()
    queryClient.setQueryData(key, 2)
    const reconcileData = vi.fn<Reconciler<number>>(
      (_oldData, data) => data * 10,
    )

    function Page() {
      const [multiplier, setMultiplier] = createSignal(1)
      const state = useQuery(() => {
        const value = multiplier()
        return {
          queryKey: key,
          queryFn: () => 2,
          staleTime: Infinity,
          select: (data: number) => data * value,
          reconcile: reconcileData,
        }
      })

      return (
        <>
          <div>data: {state.data}</div>
          <button onClick={() => setMultiplier(2)}>select</button>
        </>
      )
    }

    const rendered = renderWithClient(queryClient, () => <Page />)
    await vi.advanceTimersByTimeAsync(0)
    expect(rendered.getByText('data: 20')).toBeInTheDocument()
    expect(reconcileData).toHaveBeenCalledTimes(1)

    fireEvent.click(rendered.getByRole('button', { name: 'select' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(rendered.getByText('data: 40')).toBeInTheDocument()
    expect(reconcileData).toHaveBeenCalledTimes(2)
    expect(reconcileData).toHaveBeenLastCalledWith(20, 4)
  })

  it.each([false, true])(
    'should isolate cached query keys when their data references are equal: %s',
    async (sameData) => {
      const key = queryKey()
      const first = { id: 1, value: 'first' }
      const second = sameData ? first : { id: 1, value: 'second' }
      queryClient.setQueryData([key, 1], first)
      queryClient.setQueryData([key, 2], second)
      const reconcileData = vi.fn<Reconciler<typeof first>>((oldData, data) =>
        reconcile(data)(oldData),
      )

      function Page() {
        const [id, setId] = createSignal(1)
        const state = useQuery(() => ({
          queryKey: [key, id()],
          queryFn: () => first,
          staleTime: Infinity,
          reconcile: reconcileData,
        }))

        return (
          <>
            <div>data: {state.data?.value}</div>
            <button onClick={() => setId(2)}>switch</button>
          </>
        )
      }

      const rendered = renderWithClient(queryClient, () => <Page />)
      await vi.advanceTimersByTimeAsync(0)
      expect(rendered.getByText('data: first')).toBeInTheDocument()
      reconcileData.mockClear()

      fireEvent.click(rendered.getByRole('button', { name: 'switch' }))
      await vi.advanceTimersByTimeAsync(0)
      expect(rendered.getByText(`data: ${second.value}`)).toBeInTheDocument()
      expect(reconcileData).toHaveBeenCalledExactlyOnceWith(undefined, second)
      expect(first.value).toBe('first')
    },
  )

  it('should not mutate the previous query data when reconciling by key', async () => {
    const key = queryKey()
    queryClient.setQueryData([key, 1], { id: 1, value: 'first' })
    queryClient.setQueryData([key, 2], { id: 1, value: 'second' })
    let firstData: { id: number; value: string } | undefined

    function Page() {
      const [id, setId] = createSignal(1)
      const state = useQuery(() => ({
        queryKey: [key, id()],
        queryFn: () => ({ id: 1, value: 'unused' }),
        staleTime: Infinity,
        reconcile: 'id',
      }))

      return (
        <>
          <div>data: {state.data?.value}</div>
          <button
            onClick={() => {
              firstData = state.data
              setId(2)
            }}
          >
            switch
          </button>
        </>
      )
    }

    const rendered = renderWithClient(queryClient, () => <Page />)
    await vi.advanceTimersByTimeAsync(0)
    fireEvent.click(rendered.getByRole('button', { name: 'switch' }))
    await vi.advanceTimersByTimeAsync(0)

    expect(rendered.getByText('data: second')).toBeInTheDocument()
    expect(firstData).toStrictEqual({ id: 1, value: 'first' })
    expect(queryClient.getQueryData([key, 1])).toStrictEqual({
      id: 1,
      value: 'first',
    })
    expect(queryClient.getQueryData([key, 2])).toStrictEqual({
      id: 1,
      value: 'second',
    })
  })

  it('should reconcile infinite query data once per page fetch', async () => {
    const key = queryKey()
    const reconcileData = vi.fn<Reconciler<InfiniteData<number>>>(
      (_oldData, data) => data,
    )

    function Page() {
      const state = useInfiniteQuery(() => ({
        queryKey: key,
        queryFn: ({ pageParam }) => sleep(10).then(() => pageParam),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => lastPage + 1,
        reconcile: reconcileData,
      }))

      return (
        <>
          <div>data: {state.data?.pages.join(',')}</div>
          <button onClick={() => state.fetchNextPage()}>next</button>
        </>
      )
    }

    const rendered = renderWithClient(queryClient, () => <Page />)
    await vi.advanceTimersByTimeAsync(10)
    expect(rendered.getByText('data: 1')).toBeInTheDocument()
    expect(reconcileData).toHaveBeenCalledTimes(1)

    fireEvent.click(rendered.getByRole('button', { name: 'next' }))
    await vi.advanceTimersByTimeAsync(10)
    expect(rendered.getByText('data: 1,2')).toBeInTheDocument()
    expect(reconcileData).toHaveBeenCalledTimes(2)
  })
})
