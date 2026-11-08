import * as React from "react"

import { cn } from "@/lib/utils"

/** Marks a table's scrolling box with data-more="1" while part of the table is out of sight to the right (2026-11-08): the pinned last
 *  column then casts a shadow, so the columns sliding under it read as "scroll sideways" instead of as an overlap. */
export function useMoreMark(box: React.RefObject<HTMLDivElement | null>) {
  React.useEffect(() => {
    const el = box.current
    if (!el) return
    const mark = () => {
      const more = el.scrollWidth - el.clientWidth - el.scrollLeft > 1 ? "1" : "0"
      if (el.dataset.more !== more) el.dataset.more = more
    }
    mark()
    el.addEventListener("scroll", mark, { passive: true })
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(mark)
    ro?.observe(el)
    if (el.firstElementChild) ro?.observe(el.firstElementChild)
    return () => { el.removeEventListener("scroll", mark); ro?.disconnect() }
  }, [box])
}

/** A scrolling box for a hand-made table that behaves like the shared one: its button column is pinned and shades what slides under it. */
export function TableBox({ style, children }: { style?: React.CSSProperties; children: React.ReactNode }) {
  const box = React.useRef<HTMLDivElement>(null)
  useMoreMark(box)
  return <div ref={box} data-slot="table-container" style={{ overflowX: "auto", ...style }}>{children}</div>
}

function Table({ className, ...props }: React.ComponentProps<"table">) {
  const box = React.useRef<HTMLDivElement>(null)
  useMoreMark(box)
  return (
    <div ref={box} data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

// When given an onClick, this applies role="button"/tabIndex/onKeyDown itself
// so every clickable row is keyboard-accessible by construction, rather than
// relying on each page to remember to add it by hand.
function TableRow({ className, onClick, onKeyDown, ...props }: React.ComponentProps<"tr">) {
  const interactive = !!onClick
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
        interactive && "cursor-pointer",
        className
      )}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault()
          onClick?.(e as unknown as React.MouseEvent<HTMLTableRowElement>)
        }
        onKeyDown?.(e)
      }}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
