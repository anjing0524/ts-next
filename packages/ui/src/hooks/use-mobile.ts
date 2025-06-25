import * as React from "react"

export function useMobile(query: string = "(max-width: 768px)") {
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    setIsMobile(mediaQuery.matches)

    const handler = () => setIsMobile(mediaQuery.matches)
    mediaQuery.addEventListener("change", handler)
    return () => mediaQuery.removeEventListener("change", handler)
  }, [query])

  return isMobile
}
