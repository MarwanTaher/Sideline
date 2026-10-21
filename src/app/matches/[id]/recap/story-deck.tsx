"use client";

import { Children, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { StoryViewer } from "@/components/story-viewer";

/** The matchday recap: its cards in the shared full-screen story viewer. */
export function StoryDeck({ children, closeHref }: { children: ReactNode; closeHref: string }) {
  const cards = Children.toArray(children);
  const router = useRouter();
  const close = useCallback(() => router.push(closeHref), [router, closeHref]);
  return <StoryViewer count={cards.length} render={(i) => cards[i]} onClose={close} closeLabel="Close recap" />;
}