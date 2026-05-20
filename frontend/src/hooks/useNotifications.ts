import { useCallback, useEffect, useMemo } from "react"
import {
  useQuery,
  useQueryClient,
  useInfiniteQuery,
  type InfiniteData,
} from "@tanstack/react-query"
import { toast } from "react-hot-toast"

import { isPollEnabled } from "@/config/api"
import { Notification } from "@/interfaces/notification.interface"
import {
  fetchDashboardNotifications,
  fetchDashboardNotificationsPage,
  markDashboardNotificationsRead,
  type NotificationTypeFilter,
} from "@/services/dashboard"
import { useWebSocketDashboardContext } from "@/context/WebSocketDashboardContext"
import {
  isConversationFinalizedHostilityNotification,
  isConversationHostilityNotification,
  isConversationStartedNotification,
  isWorkflowFailedNotification,
  useNotificationUserSettings,
} from "@/hooks/useNotificationUserSettings"

export const NOTIFICATIONS_QUERY_KEY = ["notifications-feed"] as const
export const NOTIFICATIONS_INFINITE_QUERY_KEY = [
  "notifications-feed-infinite",
] as const

export function notificationsInfiniteQueryKey(
  conversationStarted: boolean,
  notificationType: NotificationTypeFilter = "all"
): readonly [string, boolean, NotificationTypeFilter] {
  return [NOTIFICATIONS_INFINITE_QUERY_KEY[0], conversationStarted, notificationType]
}

const NOTIFICATIONS_PAGE_SIZE = 20

type NotificationFeedPage = {
  items: Notification[]
  hasMore: boolean
}

function bellQueryKeyParts(
  conversationStarted: boolean,
  conversationHostility: boolean,
  conversationFinalizedHostility: boolean,
  workflowFailed: boolean
) {
  return [
    ...NOTIFICATIONS_QUERY_KEY,
    conversationStarted,
    conversationHostility,
    conversationFinalizedHostility,
    workflowFailed,
  ] as const
}

export const useNotifications = () => {
  const queryClient = useQueryClient()
  const { subscribe } = useWebSocketDashboardContext()
  const { settings } = useNotificationUserSettings()
  const {
    conversationStarted,
    conversationHostility,
    conversationFinalizedHostility,
    workflowFailed,
  } = settings

  const bellKey = bellQueryKeyParts(
    conversationStarted,
    conversationHostility,
    conversationFinalizedHostility,
    workflowFailed
  )

  const { data: notifications = [], refetch } = useQuery<Notification[]>({
    queryKey: bellKey,
    queryFn: async () => {
      const items = await fetchDashboardNotifications(80, {
        includeConversationStarted: conversationStarted,
        includeConversationHostility: conversationHostility,
        includeConversationFinalizedHostility: conversationFinalizedHostility,
        includeWorkflowFailed: workflowFailed,
      })
      return items ?? []
    },
    refetchInterval: isPollEnabled ? 15000 : false,
  })

  const updateCachedNotifications = useCallback(
    (updater: (prev: Notification[]) => Notification[]) => {
      queryClient.setQueryData<Notification[]>(bellKey, (prev) =>
        updater(prev ?? [])
      )
    },
    [queryClient, bellKey]
  )

  const markAllAsRead = useCallback(() => {
    void (async () => {
      const ids = notifications.filter((n) => !n.read).map((n) => n.id)
      if (ids.length === 0) {
        return
      }
      try {
        await markDashboardNotificationsRead(ids)
        updateCachedNotifications((prev) =>
          prev.map((notification) => ({ ...notification, read: true }))
        )
        toast.success("All notifications are marked as read.")
      } catch {
        toast.error("Could not mark notifications as read.")
        void refetch()
      }
    })()
  }, [notifications, updateCachedNotifications, refetch])

  const markAsRead = useCallback(
    (id: string) => {
      void (async () => {
        try {
          await markDashboardNotificationsRead([id])
          updateCachedNotifications((prev) =>
            prev.map((notification) =>
              notification.id === id
                ? { ...notification, read: true }
                : notification
            )
          )
        } catch {
          toast.error("Could not mark notification as read.")
          void refetch()
        }
      })()
    },
    [updateCachedNotifications, refetch]
  )

  const handleSocketMessage = useCallback(
    (data: Record<string, unknown>) => {
      const topic = String(data.type ?? data.topic ?? "")
      if (topic !== "notification") return
      const payload = (data.payload ?? {}) as Record<string, unknown>
      const incoming: Notification = {
        id: String(payload.id ?? ""),
        title: String(payload.title ?? "Notification"),
        description: String(payload.description ?? ""),
        timestamp: String(payload.timestamp ?? new Date().toISOString()),
        type: (payload.type as Notification["type"]) ?? "info",
        actionUrl: payload.action_url ? String(payload.action_url) : undefined,
        read: false,
      }

      if (!incoming.id) return
      if (!conversationStarted && isConversationStartedNotification(incoming.id)) {
        return
      }
      if (!conversationHostility && isConversationHostilityNotification(incoming.id)) {
        return
      }
      if (
        !conversationFinalizedHostility &&
        isConversationFinalizedHostilityNotification(incoming.id)
      ) {
        return
      }
      if (!workflowFailed && isWorkflowFailedNotification(incoming.id)) {
        return
      }

      updateCachedNotifications((prev) => {
        const exists = prev.some((item) => item.id === incoming.id)
        if (exists) {
          return prev.map((item) =>
            item.id === incoming.id
              ? { ...item, ...incoming, read: item.read }
              : item
          )
        }
        return [incoming, ...prev]
      })

      void queryClient.invalidateQueries({
        queryKey: NOTIFICATIONS_INFINITE_QUERY_KEY,
      })
    },
    [
      conversationStarted,
      conversationHostility,
      conversationFinalizedHostility,
      workflowFailed,
      updateCachedNotifications,
      queryClient,
    ]
  )

  useEffect(() => subscribe(handleSocketMessage), [subscribe, handleSocketMessage])

  useEffect(() => {
    void refetch()
  }, [
    conversationStarted,
    conversationHostility,
    conversationFinalizedHostility,
    workflowFailed,
    refetch,
  ])

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  )

  return {
    notifications,
    unreadCount,
    markAllAsRead,
    markAsRead,
    refetch,
  }
}

export const useNotificationsInfinite = ({
  typeFilter = "all",
}: {
  typeFilter?: NotificationTypeFilter
} = {}) => {
  const queryClient = useQueryClient()
  const { settings } = useNotificationUserSettings()
  const {
    conversationStarted,
    conversationHostility,
    conversationFinalizedHostility,
    workflowFailed,
  } = settings
  const infiniteKey = [
    ...notificationsInfiniteQueryKey(conversationStarted, typeFilter),
    conversationHostility,
    conversationFinalizedHostility,
    workflowFailed,
  ] as const

  const bellKey = bellQueryKeyParts(
    conversationStarted,
    conversationHostility,
    conversationFinalizedHostility,
    workflowFailed
  )

  const infinite = useInfiniteQuery({
    queryKey: infiniteKey,
    queryFn: async ({ pageParam }): Promise<NotificationFeedPage> => {
      const skip = pageParam as number
      const page = await fetchDashboardNotificationsPage(
        NOTIFICATIONS_PAGE_SIZE,
        skip,
        conversationStarted,
        conversationHostility,
        conversationFinalizedHostility,
        workflowFailed,
        typeFilter
      )
      if (!page) return { items: [], hasMore: false }
      return {
        items: page.items,
        hasMore: page.hasMore,
      }
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastSkip) =>
      lastPage.hasMore ? (lastSkip as number) + lastPage.items.length : undefined,
  })

  const flatNotifications = useMemo(
    () => infinite.data?.pages.flatMap((p) => p.items) ?? [],
    [infinite.data]
  )

  const setInfinitePagesRead = useCallback(
    (predicate: (n: Notification) => boolean) => {
      queryClient.setQueryData<InfiniteData<NotificationFeedPage>>(
        infiniteKey,
        (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((n) =>
                predicate(n) ? { ...n, read: true } : n
              ),
            })),
          }
        }
      )
    },
    [queryClient, infiniteKey]
  )

  const markAsRead = useCallback(
    (id: string) => {
      void (async () => {
        try {
          await markDashboardNotificationsRead([id])
          setInfinitePagesRead((n) => n.id === id)
          void queryClient.invalidateQueries({ queryKey: bellKey })
        } catch {
          toast.error("Could not mark notification as read.")
          void infinite.refetch()
        }
      })()
    },
    [bellKey, setInfinitePagesRead, queryClient, infinite.refetch]
  )

  const markAllAsRead = useCallback(() => {
    void (async () => {
      const pages = queryClient.getQueryData<InfiniteData<NotificationFeedPage>>(
        infiniteKey
      )
      const items = pages?.pages.flatMap((p) => p.items) ?? []
      const ids = items.filter((n) => !n.read).map((n) => n.id)
      if (ids.length === 0) {
        return
      }
      try {
        await markDashboardNotificationsRead(ids)
        setInfinitePagesRead(() => true)
        void queryClient.invalidateQueries({ queryKey: bellKey })
        toast.success("All loaded notifications are marked as read.")
      } catch {
        toast.error("Could not mark notifications as read.")
        void infinite.refetch()
      }
    })()
  }, [
    queryClient,
    infiniteKey,
    setInfinitePagesRead,
    bellKey,
    infinite.refetch,
  ])

  return {
    notifications: flatNotifications,
    hasNextPage: infinite.hasNextPage,
    fetchNextPage: infinite.fetchNextPage,
    isFetchingNextPage: infinite.isFetchingNextPage,
    isLoading: infinite.isPending,
    isError: infinite.isError,
    refetch: infinite.refetch,
    markAsRead,
    markAllAsRead,
  }
}
