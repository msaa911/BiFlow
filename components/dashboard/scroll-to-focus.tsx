
'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export function ScrollToFocus() {
    const searchParams = useSearchParams()
    const focus = searchParams.get('focus')

    useEffect(() => {
        if (focus) {
            const element = document.getElementById(focus)
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' })
                // Add a brief highlight effect
                element.classList.add('ring-2', 'ring-emerald-500', 'ring-offset-4', 'ring-offset-black', 'rounded-2xl')
                setTimeout(() => {
                    element.classList.remove('ring-2', 'ring-emerald-500', 'ring-offset-4', 'ring-offset-black')
                }, 3000)
            }
        }
    }, [focus])

    return null
}
