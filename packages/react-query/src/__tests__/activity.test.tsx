import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import * as React from 'react'
import { queryKey, sleep } from '@tanstack/query-test-utils'
import {
  QueryClient,
  useQueries,
  useQuery,
  useSuspenseQueries,
  useSuspenseQuery,
} from '..'
import { renderWithClient } from './utils'

describe('Activity', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.useFakeTimers()
    queryClient = new QueryClient()
  })

  afterEach(() => {
    queryClient.clear()
    vi.useRealTimers()
  })

  it.each([
    ['useQuery', useQuery, ['a', 'b']],
    ['useSuspenseQuery', useSuspenseQuery, ['a', 'b', 'b']],
  ] as const)(
    'should fetch only the current key when revealing %s',
    async (_, useQueryHook, expectedFetches) => {
      const key = queryKey()
      const fetched: Array<string> = []

      function Page({ filter }: { filter: string }) {
        const { data } = useQueryHook({
          queryKey: [...key, filter],
          queryFn: () => {
            fetched.push(filter)
            return sleep(10).then(() => filter)
          },
        })

        return <p>data: {data}</p>
      }

      const view = (mode: 'visible' | 'hidden', filter: string) => (
        <React.Activity mode={mode}>
          <React.Suspense fallback="loading">
            <Page filter={filter} />
          </React.Suspense>
        </React.Activity>
      )

      const rendered = renderWithClient(queryClient, view('visible', 'a'))
      await act(() => vi.advanceTimersByTimeAsync(20))
      expect(rendered.getByText('data: a')).toBeVisible()

      rendered.rerender(view('hidden', 'b'))
      // Suspense queries need at least one second to become stale.
      await act(() => vi.advanceTimersByTimeAsync(1100))

      rendered.rerender(view('visible', 'b'))
      await act(() => vi.advanceTimersByTimeAsync(20))

      expect(rendered.getByText('data: b')).toBeVisible()
      expect(fetched).toStrictEqual(expectedFetches)
      expect(
        queryClient.getQueryCache().find({ queryKey: [...key, 'a'] })!
          .observers,
      ).toHaveLength(0)
      expect(
        queryClient.getQueryCache().find({ queryKey: [...key, 'b'] })!
          .observers,
      ).toHaveLength(1)
    },
  )

  it.each([
    ['useQueries', useQueries, ['a1', 'a2', 'b1', 'b2']],
    [
      'useSuspenseQueries',
      useSuspenseQueries,
      ['a1', 'a2', 'b1', 'b2', 'b1', 'b2'],
    ],
  ] as const)(
    'should fetch only the current keys when revealing %s',
    async (_, useQueriesHook, expectedFetches) => {
      const key = queryKey()
      const fetched: Array<string> = []

      function Page({ filter }: { filter: string }) {
        const results = useQueriesHook({
          queries: [1, 2].map((id) => ({
            queryKey: [...key, filter, id],
            queryFn: () => {
              fetched.push(`${filter}${id}`)
              return sleep(10).then(() => `${filter}${id}`)
            },
          })),
        })

        return <p>data: {results.map((result) => result.data).join(', ')}</p>
      }

      const view = (mode: 'visible' | 'hidden', filter: string) => (
        <React.Activity mode={mode}>
          <React.Suspense fallback="loading">
            <Page filter={filter} />
          </React.Suspense>
        </React.Activity>
      )

      const rendered = renderWithClient(queryClient, view('visible', 'a'))
      await act(() => vi.advanceTimersByTimeAsync(20))
      expect(rendered.getByText('data: a1, a2')).toBeVisible()

      rendered.rerender(view('hidden', 'b'))
      await act(() => vi.advanceTimersByTimeAsync(1100))

      rendered.rerender(view('visible', 'b'))
      await act(() => vi.advanceTimersByTimeAsync(20))

      expect(rendered.getByText('data: b1, b2')).toBeVisible()
      expect(fetched).toStrictEqual(expectedFetches)
    },
  )
})
