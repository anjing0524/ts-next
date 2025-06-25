"use client"

import * as React from "react"
import * as RAvatar from "@radix-ui/react-avatar"

import { cn } from "../utils"

const Avatar = React.forwardRef<
  React.ElementRef<typeof RAvatar.Root>,
  React.ComponentPropsWithoutRef<typeof RAvatar.Root>
>(({ className, ...props }, ref) => (
  <RAvatar.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
))
Avatar.displayName = RAvatar.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof RAvatar.Image>,
  React.ComponentPropsWithoutRef<typeof RAvatar.Image>
>(({ className, ...props }, ref) => (
  <RAvatar.Image
    ref={ref}
    className={cn("aspect-square h-full w-full", className)}
    {...props}
  />
))
AvatarImage.displayName = RAvatar.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof RAvatar.Fallback>,
  React.ComponentPropsWithoutRef<typeof RAvatar.Fallback>
>(({ className, ...props }, ref) => (
  <RAvatar.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = RAvatar.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback }
