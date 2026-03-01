'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

const TabsContext = React.createContext<any>(null)

const Tabs = ({ children, defaultValue, value, onValueChange, className }: any) => {
    const [internalTab, setInternalTab] = React.useState(defaultValue || value || '')

    // Use controlled value if provided, otherwise use internal state
    const activeTab = value !== undefined ? value : internalTab
    const setActiveTab = (newValue: string) => {
        if (onValueChange) onValueChange(newValue)
        if (value === undefined) setInternalTab(newValue)
    }

    return (
        <TabsContext.Provider value={{ activeTab, setActiveTab }}>
            <div className={cn('w-full', className)}>
                {children}
            </div>
        </TabsContext.Provider>
    )
}

const TabsList = ({ children, className }: any) => (
    <div className={cn('flex gap-2 bg-gray-900 p-1 rounded-xl', className)}>
        {children}
    </div>
)

const TabsTrigger = ({ value, children, className }: any) => {
    const context = React.useContext(TabsContext)
    if (!context) throw new Error('TabsTrigger must be used within a Tabs')

    const { activeTab, setActiveTab } = context

    return (
        <button
            onClick={() => setActiveTab(value)}
            className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-all',
                activeTab === value
                    ? 'bg-gray-800 text-white shadow-lg'
                    : 'text-gray-500 hover:text-gray-300',
                className
            )}
        >
            {children}
        </button>
    )
}

const TabsContent = ({ value, children }: any) => {
    const context = React.useContext(TabsContext)
    if (!context) throw new Error('TabsContent must be used within a Tabs')

    const { activeTab } = context

    if (activeTab !== value) return null
    return <div className="mt-4 animate-in fade-in duration-300">{children}</div>
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
