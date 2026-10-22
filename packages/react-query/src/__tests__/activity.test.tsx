import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from '@testing-library/react'
import { queryKey } from '@tanstack/query-test-utils'
import {
  QueryClient,
  useQueries,
  useQuery,
  useSuspenseQueries,
  useSuspenseQuery,
} from '..'
import { renderWithClient } from './utils'
import type { QueryKey } from '..'

type ActivityQueryOptions = {
  queryKey: QueryKey
  queryFn: () => Promise<string>
  staleTime: number
  refetchOnMount?: boolean
}

function useQueryData(options: ActivityQueryOptions) {
  return useQuery(options).data
}

function useSuspenseQueryData(options: ActivityQueryOptions) {
  return useSuspenseQuery(options).data
}

function useQueriesData(options: ActivityQueryOptions) {
  return useQueries({ queries: [options] })[0].data
}

function useSuspenseQueriesData(options: ActivityQueryOptions) {
  return useSuspenseQueries({ queries: [options] })[0].data
}

describe.each([
  ['useQuery', useQueryData],
  ['useSuspenseQuery', useSuspenseQueryData],
  ['useQueries', useQueriesData],
  ['useSuspenseQueries', useSuspenseQueriesData],
] as const)('%s in an Activity', (_name, useData) => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.useFakeTimers()
    queryClient = new QueryClient()
  })

  afterEach(() => {
    queryClient.clear()
    vi.useRealTimers()
  })

  it('should only fetch the current key when revealed after a hidden key change', async () => {
    const key = queryKey()
    const queryFn = vi.fn<(filter: string) => Promise<string>>((filter) =>
      Promise.resolve(filter),
    )

    function Page({ filter }: { filter: string }) {
      const data = useData({
        queryKey: [...key, filter],
        queryFn: () => queryFn(filter),
        staleTime: 1000,
      })
      return <p>{data}</p>
    }

    function App({
      mode,
      filter,
    }: {
      mode: 'visible' | 'hidden'
      filter: string
    }) {
      return (
        <React.Activity mode={mode}>
          <React.Suspense fallback="loading">
            <Page filter={filter} />
          </React.Suspense>
        </React.Activity>
      )
    }

    const rendered = renderWithClient(
      queryClient,
      <App mode="visible" filter="a" />,
    )
    await act(() => vi.advanceTimersByTimeAsync(10))
    expect(rendered.getByText('a')).toBeVisible()
    expect(queryFn.mock.calls).toStrictEqual([['a']])

    rendered.rerender(<App mode="hidden" filter="b" />)
    // Allow the hidden render and expire Suspense's minimum staleTime.
    await act(() => vi.advanceTimersByTimeAsync(1100))
    const oldQuery = queryClient.getQueryCache().find({
      queryKey: [...key, 'a'],
    })!
    expect(oldQuery.getObserversCount()).toBe(0)
    expect(
      queryClient.getQueryCache().find({ queryKey: [...key, 'b'] }),
    ).toBeDefined()

    rendered.rerender(<App mode="visible" filter="b" />)
    await act(() => vi.advanceTimersByTimeAsync(10))

    expect(rendered.getByText('b')).toBeVisible()
    expect(queryFn).toHaveBeenCalledWith('b')
    expect(
      queryFn.mock.calls.filter(([filter]) => filter === 'a'),
    ).toStrictEqual([['a']])
    expect(oldQuery.getObserversCount()).toBe(0)
    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: [...key, 'b'] })!
        .getObserversCount(),
    ).toBe(1)
  })

  it.each([
    { refetchOnMount: true, expectedFetches: 2 },
    { refetchOnMount: false, expectedFetches: 1 },
  ])(
    'should respect the current refetchOnMount option ($refetchOnMount) when revealed with the same key',
    async ({ refetchOnMount, expectedFetches }) => {
      const key = queryKey()
      const queryFn = vi.fn<() => Promise<string>>().mockResolvedValue('data')

      function Page({ refetch }: { refetch: boolean }) {
        const data = useData({
          queryKey: key,
          queryFn,
          staleTime: 1000,
          refetchOnMount: refetch,
        })
        return <p>{data}</p>
      }

      function App({
        mode,
        refetch,
      }: {
        mode: 'visible' | 'hidden'
        refetch: boolean
      }) {
        return (
          <React.Activity mode={mode}>
            <React.Suspense fallback="loading">
              <Page refetch={refetch} />
            </React.Suspense>
          </React.Activity>
        )
      }

      const rendered = renderWithClient(
        queryClient,
        <App mode="visible" refetch={true} />,
      )
      await act(() => vi.advanceTimersByTimeAsync(10))
      expect(rendered.getByText('data')).toBeVisible()
      expect(queryFn).toHaveBeenCalledTimes(1)

      rendered.rerender(<App mode="hidden" refetch={refetchOnMount} />)
      await act(() => vi.advanceTimersByTimeAsync(1100))
      expect(queryFn).toHaveBeenCalledTimes(1)

      rendered.rerender(<App mode="visible" refetch={refetchOnMount} />)
      await act(() => vi.advanceTimersByTimeAsync(10))

      expect(rendered.getByText('data')).toBeVisible()
      expect(queryFn).toHaveBeenCalledTimes(expectedFetches)
    },
  )
})
