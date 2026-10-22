import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSignal } from 'solid-js'
import { queryKey, sleep } from '@tanstack/query-test-utils'
import { QueryClient, useInfiniteQuery, useQuery } from '..'
import { renderWithClient } from './utils'
import type { InfiniteData, UseQueryResult } from '..'

describe('reconcile', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.useFakeTimers()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  afterEach(() => {
    queryClient.clear()
    vi.useRealTimers()
  })

  it('should reconcile new data once and preserve it on fetch and error updates', async () => {
    const key = queryKey()
    const reconcile = vi.fn<
      (
        oldData: { value: number } | undefined,
        newData: { value: number },
      ) => { value: number }
    >((_oldData, newData) => ({ value: newData.value * 10 }))
    let count = 0
    let state!: UseQueryResult<{ value: number }>

    function Page() {
      state = useQuery(() => ({
        queryKey: key,
        queryFn: async () => {
          await sleep(10)
          if (++count === 3) throw new Error('refetch failed')
          return { value: count }
        },
        reconcile,
      }))
      return <div>{state.data?.value}</div>
    }

    const rendered = renderWithClient(queryClient, () => <Page />)
    expect(reconcile).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(10)
    expect(reconcile).toHaveBeenCalledExactlyOnceWith(undefined, { value: 1 })
    expect(rendered.getByText('10')).toBeInTheDocument()

    void state.refetch()
    await vi.advanceTimersByTimeAsync(0)
    expect(state.isFetching).toBe(true)
    expect(reconcile).toHaveBeenCalledTimes(1)
    expect(rendered.getByText('10')).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(10)
    expect(state.isFetching).toBe(false)
    expect(reconcile).toHaveBeenCalledTimes(2)
    expect(reconcile).toHaveBeenLastCalledWith({ value: 10 }, { value: 2 })
    expect(rendered.getByText('20')).toBeInTheDocument()

    void state.refetch()
    await vi.advanceTimersByTimeAsync(10)
    expect(state.isRefetchError).toBe(true)
    expect(state.error?.message).toBe('refetch failed')
    expect(reconcile).toHaveBeenCalledTimes(2)
    expect(rendered.getByText('20')).toBeInTheDocument()

    queryClient.setQueryData(key, { value: 4 })
    await vi.advanceTimersByTimeAsync(0)
    expect(reconcile).toHaveBeenCalledTimes(3)
    expect(reconcile).toHaveBeenLastCalledWith({ value: 20 }, { value: 4 })
    expect(rendered.getByText('40')).toBeInTheDocument()
  })

  it.each([null, 0, { value: 1 }])(
    'should skip unchanged data across refetches and option updates (%j)',
    async (data) => {
      const key = queryKey()
      const [enabled, setEnabled] = createSignal(true)
      const reconcile = vi.fn<
        (oldData: typeof data | undefined, newData: typeof data) => typeof data
      >((_oldData, newData) => newData)
      let state!: UseQueryResult<typeof data>

      function Page() {
        state = useQuery(() => ({
          queryKey: key,
          queryFn: () => sleep(10).then(() => data),
          initialData: data,
          enabled: enabled(),
          reconcile,
        }))
        return <div>{JSON.stringify(state.data)}</div>
      }

      renderWithClient(queryClient, () => <Page />)
      await vi.advanceTimersByTimeAsync(10)
      expect(reconcile).toHaveBeenCalledExactlyOnceWith(undefined, data)

      setEnabled(false)
      await vi.advanceTimersByTimeAsync(0)
      expect(state.isEnabled).toBe(false)
      expect(reconcile).toHaveBeenCalledTimes(1)

      void state.refetch()
      await vi.advanceTimersByTimeAsync(10)
      expect(state.data).toStrictEqual(data)
      expect(reconcile).toHaveBeenCalledTimes(1)
    },
  )

  it.each([undefined, { id: 2 }])(
    'should reset old data when changing query keys (cached data: %j)',
    async (cachedData) => {
      const key = queryKey()
      const [id, setId] = createSignal(1)
      const reconcile = vi.fn<
        (
          oldData: { id: number } | undefined,
          newData: { id: number },
        ) => { id: number }
      >((_oldData, newData) => ({ ...newData }))
      queryClient.setQueryData([key, 2], cachedData)
      let state!: UseQueryResult<{ id: number }>

      function Page() {
        state = useQuery(() => ({
          queryKey: [key, id()],
          queryFn: ({ queryKey: [, value] }) =>
            sleep(10).then(() => ({ id: value as number })),
          staleTime: Infinity,
          reconcile,
        }))
        return <div>{state.data?.id ?? 'pending'}</div>
      }

      const rendered = renderWithClient(queryClient, () => <Page />)
      await vi.advanceTimersByTimeAsync(10)
      expect(reconcile).toHaveBeenCalledExactlyOnceWith(undefined, { id: 1 })

      setId(2)
      expect(state.data).toStrictEqual(cachedData)
      expect(
        rendered.getByText(String(cachedData?.id ?? 'pending')),
      ).toBeInTheDocument()
      await vi.advanceTimersByTimeAsync(10)
      expect(reconcile).toHaveBeenCalledTimes(2)
      expect(reconcile).toHaveBeenLastCalledWith(undefined, { id: 2 })
      expect(rendered.getByText('2')).toBeInTheDocument()

      setId(1)
      await vi.advanceTimersByTimeAsync(0)
      expect(reconcile).toHaveBeenCalledTimes(3)
      expect(reconcile).toHaveBeenLastCalledWith(undefined, { id: 1 })
      expect(rendered.getByText('1')).toBeInTheDocument()
    },
  )

  it('should reset old data when changing clients with the same query key', async () => {
    const key = queryKey()
    const otherClient = new QueryClient()
    const [client, setClient] = createSignal(queryClient)
    const reconcile = vi.fn<
      (oldData: string | undefined, newData: string) => string
    >((_oldData, newData) => newData)
    queryClient.setQueryData(key, 'first')
    otherClient.setQueryData(key, 'second')

    function Page() {
      const state = useQuery(
        () => ({ queryKey: key, enabled: false, reconcile }),
        client,
      )
      return <div>{state.data}</div>
    }

    try {
      const rendered = renderWithClient(queryClient, () => <Page />)
      await vi.advanceTimersByTimeAsync(0)
      expect(reconcile).toHaveBeenCalledExactlyOnceWith(undefined, 'first')

      setClient(otherClient)
      await vi.advanceTimersByTimeAsync(0)
      expect(reconcile).toHaveBeenCalledTimes(2)
      expect(reconcile).toHaveBeenLastCalledWith(undefined, 'second')
      expect(rendered.getByText('second')).toBeInTheDocument()
    } finally {
      otherClient.clear()
    }
  })

  it('should reconcile new selected data without a cache update', async () => {
    const key = queryKey()
    const [factor, setFactor] = createSignal(1)
    const reconcile = vi.fn<
      (oldData: number | undefined, newData: number) => number
    >((_oldData, newData) => newData * 10)

    function Page() {
      const state = useQuery(() => {
        const multiplier = factor()
        return {
          queryKey: key,
          initialData: 2,
          enabled: false,
          select: (data: number) => data * multiplier,
          reconcile,
        }
      })
      return <div>{state.data}</div>
    }

    const rendered = renderWithClient(queryClient, () => <Page />)
    await vi.advanceTimersByTimeAsync(0)
    expect(reconcile).toHaveBeenCalledExactlyOnceWith(undefined, 2)
    expect(rendered.getByText('20')).toBeInTheDocument()

    setFactor(2)
    await vi.advanceTimersByTimeAsync(0)
    expect(reconcile).toHaveBeenCalledTimes(2)
    expect(reconcile).toHaveBeenLastCalledWith(20, 4)
    expect(rendered.getByText('40')).toBeInTheDocument()
  })

  it('should keep string reconciliation isolated from other query keys and the cache', async () => {
    const key = queryKey()
    const [id, setId] = createSignal(1)
    const first = [{ id: 1, value: 'first' }]
    queryClient.setQueryData([key, 1], first)
    queryClient.setQueryData([key, 2], [{ id: 1, value: 'second' }])
    let state!: UseQueryResult<typeof first>

    function Page() {
      state = useQuery(() => ({
        queryKey: [key, id()],
        enabled: false,
        reconcile: 'id',
      }))
      return <div>{state.data?.[0]?.value}</div>
    }

    const rendered = renderWithClient(queryClient, () => <Page />)
    await vi.advanceTimersByTimeAsync(0)
    const firstItem = state.data?.[0]

    setId(2)
    await vi.advanceTimersByTimeAsync(0)
    expect(rendered.getByText('second')).toBeInTheDocument()
    expect(state.data?.[0]).not.toBe(firstItem)
    expect(firstItem?.value).toBe('first')
    expect(queryClient.getQueryData([key, 1])).toStrictEqual(first)
    expect(first).toStrictEqual([{ id: 1, value: 'first' }])
  })

  it('should reconcile infinite query data once per page update', async () => {
    const key = queryKey()
    const reconcile = vi.fn<
      (
        oldData: InfiniteData<number> | undefined,
        newData: InfiniteData<number>,
      ) => InfiniteData<number>
    >((_oldData, newData) => newData)
    let fetchNextPage!: () => unknown

    function Page() {
      const state = useInfiniteQuery(() => ({
        queryKey: key,
        queryFn: ({ pageParam }) => sleep(10).then(() => pageParam),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => lastPage + 1,
        reconcile,
      }))
      fetchNextPage = state.fetchNextPage
      return <div>{state.data?.pages.join(',')}</div>
    }

    const rendered = renderWithClient(queryClient, () => <Page />)
    expect(reconcile).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10)
    expect(reconcile).toHaveBeenCalledExactlyOnceWith(undefined, {
      pages: [1],
      pageParams: [1],
    })

    void fetchNextPage()
    await vi.advanceTimersByTimeAsync(0)
    expect(reconcile).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10)
    expect(reconcile).toHaveBeenCalledTimes(2)
    expect(reconcile).toHaveBeenLastCalledWith(
      { pages: [1], pageParams: [1] },
      { pages: [1, 2], pageParams: [1, 2] },
    )
    expect(rendered.getByText('1,2')).toBeInTheDocument()
  })
})
