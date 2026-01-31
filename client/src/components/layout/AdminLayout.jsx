import React from 'react'
import { Outlet } from 'react-router-dom'
import AdminNav from './AdminNav.jsx'

export default function AdminLayout() {
    return (
        <div className="flex min-h-screen bg-gray-50">
            <AdminNav />
            <div className="flex-1 ml-64 p-8 overflow-hidden">
                <Outlet />
            </div>
        </div>
    )
}
