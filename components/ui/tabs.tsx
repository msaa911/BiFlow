'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

const Tabs = ({ children, defaultValue, className }: any) => {
    const [activeTab, setActiveTab] = React.useState(defaultValue)
    return (
        <div className={cn('w-full', className)}>
            {React.Children.map(children, (child) => {
                if (React.isValidElement(child)) {
                    return React.cloneElement(child as React.ReactElement<any>, { activeTab, setActiveTab })
                }
                return child
            })}
        </div>
    )
}

const TabsList = ({ children, className, activeTab, setActiveTab }: any) => (
    <div className={cn('flex gap-2 bg-gray-900 p-1 rounded-xl', className)}>
        {React.Children.map(children, (child) => {
            if (React.isValidElement(child)) {
                return React.cloneElement(child as React.ReactElement<any>, { activeTab, setActiveTab })
            }
            return child
        })}
    </div>
)

const TabsTrigger = ({ value, children, className, activeTab, setActiveTab }: any) => (
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

const TabsContent = ({ value, children, activeTab }: any) => {
    if (activeTab !== value) return null
    return <div className="mt-4 animate-in fade-in duration-300">{children}</div>
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
