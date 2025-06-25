"use client"

import * as React from "react"
// Assuming dialog.tsx exists in the same directory and exports these
import { Dialog, DialogContent, DialogTrigger, DialogPortal, DialogOverlay, DialogClose, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from "./dialog"
import { cn } from "../utils"

const Drawer = Dialog
const DrawerTrigger = DialogTrigger
const DrawerClose = DialogClose
const DrawerPortal = DialogPortal
const DrawerOverlay = DialogOverlay

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  React.ComponentPropsWithoutRef<typeof DialogContent> & { side?: "top" | "bottom" | "left" | "right" }
>(({ className, children, side = "left", ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DialogContent
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-background p-6 shadow-lg transition ease-in-out duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out",
        side === "top" && "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        side === "bottom" && "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        side === "left" && "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        side === "right" && "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
        className
      )}
      {...props}
    >
      {children}
      <DrawerClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        {/* Using a simple X for now, lucide-react X can be used if preferred */}
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        <span className="sr-only">Close</span>
      </DrawerClose>
    </DialogContent>
  </DrawerPortal>
))
DrawerContent.displayName = "DrawerContent"

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  // Re-using DialogHeader structure and applying it through props or specific class if needed
  <div className={cn("text-lg font-semibold leading-none tracking-tight p-0 text-center mb-4", className)} {...props} />
)
DrawerHeader.displayName = "DrawerHeader"


const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  // Re-using DialogFooter structure
  <div className={cn("mt-auto flex flex-col gap-2 p-0", className)} {...props} />
)
DrawerFooter.displayName = "DrawerFooter"

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DialogTitle>,
  React.ComponentPropsWithoutRef<typeof DialogTitle>
>(({ className, ...props }, ref) => (
  <DialogTitle ref={ref} className={cn("text-lg font-semibold text-foreground", className)} {...props} />
))
DrawerTitle.displayName = DialogTitle.displayName

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DialogDescription>,
  React.ComponentPropsWithoutRef<typeof DialogDescription>
>(({ className, ...props }, ref) => (
  <DialogDescription ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
))
DrawerDescription.displayName = DialogDescription.displayName

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
