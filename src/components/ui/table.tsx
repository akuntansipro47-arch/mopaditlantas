import * as React from "react"
import { cn } from "@/lib/utils"

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => {
  const topScrollRef = React.useRef<HTMLDivElement | null>(null)
  const topScrollInnerRef = React.useRef<HTMLDivElement | null>(null)
  const bottomScrollRef = React.useRef<HTMLDivElement | null>(null)
  const [showTopScrollbar, setShowTopScrollbar] = React.useState(false)
  const syncingRef = React.useRef<"top" | "bottom" | null>(null)

  const updateScroll = React.useCallback(() => {
    const bottom = bottomScrollRef.current
    const top = topScrollRef.current
    const topInner = topScrollInnerRef.current
    if (!bottom || !top || !topInner) return

    const shouldShow = bottom.scrollWidth > bottom.clientWidth + 1
    setShowTopScrollbar(shouldShow)
    topInner.style.width = `${bottom.scrollWidth}px`
    top.scrollLeft = bottom.scrollLeft
  }, [])

  React.useLayoutEffect(() => {
    updateScroll()
    const bottom = bottomScrollRef.current
    if (!bottom) return
    const ro = new ResizeObserver(() => updateScroll())
    ro.observe(bottom)
    return () => ro.disconnect()
  }, [updateScroll])

  React.useEffect(() => {
    const bottom = bottomScrollRef.current
    const top = topScrollRef.current
    if (!bottom || !top) return

    const onBottomScroll = () => {
      if (syncingRef.current === "top") return
      syncingRef.current = "bottom"
      top.scrollLeft = bottom.scrollLeft
      syncingRef.current = null
    }

    const onTopScroll = () => {
      if (syncingRef.current === "bottom") return
      syncingRef.current = "top"
      bottom.scrollLeft = top.scrollLeft
      syncingRef.current = null
    }

    bottom.addEventListener("scroll", onBottomScroll, { passive: true })
    top.addEventListener("scroll", onTopScroll, { passive: true })

    return () => {
      bottom.removeEventListener("scroll", onBottomScroll)
      top.removeEventListener("scroll", onTopScroll)
    }
  }, [])

  return (
    <div className="relative w-full">
      <div
        ref={topScrollRef}
        className={cn(
          "w-full overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent",
          !showTopScrollbar && "hidden"
        )}
      >
        <div ref={topScrollInnerRef} className="h-3" />
      </div>
      <div
        ref={bottomScrollRef}
        className="relative w-full overflow-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent"
      >
        <table
          ref={ref}
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
    </div>
  )
})
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-slate-100/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-slate-100/50 data-[state=selected]:bg-slate-100",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-4 text-left align-middle font-medium text-slate-500 [&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-slate-500", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

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
