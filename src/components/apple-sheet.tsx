import type { ReactNode } from "react"
import { Dialog } from "radix-ui"
import { cn } from "@/lib/utils"

type AppleSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export function AppleSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: AppleSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          style={{ animationDuration: "200ms" }}
        />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col rounded-t-2xl border-t border-zinc-200/50 bg-white outline-none dark:border-zinc-800/50 dark:bg-[#1C1C1E]",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
            className
          )}
          style={{ animationDuration: "240ms" }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex shrink-0 flex-col items-center pt-3 pb-2">
            <div
              className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600"
              aria-hidden
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
            <Dialog.Title className="text-lg font-bold tracking-tight text-foreground">
              {title}
            </Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-1 text-sm text-[#8E8E93]">
                {description}
              </Dialog.Description>
            ) : null}
            <div className="mt-6">{children}</div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
