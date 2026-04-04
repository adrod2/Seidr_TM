import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

// We use any here to avoid needing to install the specific next-themes types package
export function ThemeProvider({ children, ...props }: any) {
  return <NextThemesProvider attribute="class" {...props}>{children}</NextThemesProvider>
}