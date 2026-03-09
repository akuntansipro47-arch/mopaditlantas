import * as React from "react";
import { cn } from "@/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

function Command({ className, ...props }: DivProps) {
  return <div className={cn("bg-white", className)} {...props} />;
}

const CommandInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { onValueChange?: (value: string) => void }>(
  ({ className, onValueChange, onChange, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full border-b px-3 py-2 text-sm outline-none placeholder:text-slate-500",
          className
        )}
        onChange={(e) => {
          onChange?.(e);
          onValueChange?.(e.target.value);
        }}
        {...props}
      />
    );
  }
);
CommandInput.displayName = "CommandInput";

function CommandList({ className, ...props }: DivProps) {
  return <div className={cn("max-h-80 overflow-auto", className)} {...props} />;
}

function CommandEmpty({ className, ...props }: DivProps) {
  return <div className={cn("p-3 text-sm text-slate-500", className)} {...props} />;
}

function CommandGroup({
  className,
  heading,
  ...props
}: DivProps & { heading?: React.ReactNode }) {
  return (
    <div className={cn("p-2", className)} {...props}>
      {heading ? (
        <div className="px-2 pb-2 text-xs font-semibold text-slate-500">{heading}</div>
      ) : null}
      {props.children}
    </div>
  );
}

type CommandItemProps = React.HTMLAttributes<HTMLDivElement> & {
  onSelect?: () => void;
};
function CommandItem({ className, onSelect, onClick, ...props }: CommandItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-100",
        className
      )}
      onClick={(e) => {
        onClick?.(e);
        onSelect?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.();
        }
      }}
      {...props}
    />
  );
}

export { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem };

