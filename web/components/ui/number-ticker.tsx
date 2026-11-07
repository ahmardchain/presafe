"use client"

// Adapted from Magic UI's NumberTicker (https://magicui.design, MIT).
// Changes for Presafe: the server-rendered text is the real value (so the page reads correctly
// without JavaScript and for screen readers/crawlers), and the count-up uses a timed tween that
// ends exactly on the value instead of a slow-settling spring.

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react"
import { animate, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number
  startValue?: number
  delay?: number
  duration?: number
  decimalPlaces?: number
}

const format = (n: number, decimals: number) =>
  Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n)

export function NumberTicker({
  value,
  startValue = 0,
  delay = 0,
  duration = 1.2,
  className,
  decimalPlaces = 0,
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: "0px" })
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!isInView || reduce || !ref.current) return
    const el = ref.current
    const controls = animate(startValue, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = format(v, decimalPlaces)
      },
      onComplete: () => {
        el.textContent = format(value, decimalPlaces)
      },
    })
    return () => controls.stop()
  }, [isInView, reduce, value, startValue, delay, duration, decimalPlaces])

  return (
    <span ref={ref} className={cn("inline-block tabular-nums", className)} {...props}>
      {format(value, decimalPlaces)}
    </span>
  )
}
