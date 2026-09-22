import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[opacity,transform,background-color,color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/50 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-forest text-forest-fg hover:opacity-90",
        ink: "bg-ink text-paper hover:opacity-90",
        ghost: "bg-transparent text-ink-soft hover:bg-ink/6 hover:text-ink",
        outline: "bg-transparent text-ink shadow-[0_0_0_1px_var(--color-line)] hover:bg-ink/4",
        desk: "bg-transparent text-desk-fg/80 hover:bg-desk-fg/10 hover:text-desk-fg",
        danger: "bg-transparent text-danger hover:bg-danger/10",
        dangerSolid: "bg-danger text-paper hover:opacity-90",
      },
      size: {
        default: "h-10 rounded-md px-3.5 text-sm",
        sm: "h-8 rounded-sm px-2.5 text-xs",
        icon: "size-8 rounded-sm",
        iconSm: "size-7 rounded-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
