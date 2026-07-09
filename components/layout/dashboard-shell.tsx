'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { SidebarLayout } from '@/components/layout/sidebar';
import { Button } from '@/components/ui/button';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';

interface DashboardShellProps {
  title: string;
  children: ReactNode;
}

function getRouteTitle(pathname: string, fallback: string): string {
  if (pathname === '/dashboard' || pathname === '/dashboard/') return 'Dashboard';
  if (pathname.startsWith('/dashboard/assets/')) return 'Asset Details';
  if (pathname.startsWith('/dashboard/assets')) return 'Assets';
  if (pathname.startsWith('/dashboard/clients')) return 'Clients';
  if (pathname.startsWith('/dashboard/approvals')) return 'Approvals';
  if (pathname.startsWith('/dashboard/kanban')) return 'Kanban';
  if (pathname.startsWith('/dashboard/queue')) return 'Upload Queue';
  if (pathname.startsWith('/dashboard/calendar')) return 'Calendar';
  if (pathname.startsWith('/dashboard/settings')) return 'Settings';
  return fallback;
}

export function DashboardShell({ title, children }: DashboardShellProps) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let isActive = true;
    const supabase = createBrowserSupabaseClient();

    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (isActive) {
        setUser(data.user ?? null);
      }
    };

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isActive) {
        setUser(session?.user ?? null);
      }
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  const routeTitle = getRouteTitle(pathname, title);

  return (
    <SidebarProvider>
      <SidebarLayout user={user} />
      <SidebarInset>
        <header className="sticky top-0 z-50 flex h-14 items-center gap-4 border-b border-[rgba(255,255,255,0.06)] bg-[var(--sidebar)] px-4 md:px-6">
          <SidebarTrigger className="-ml-1 text-[#71717a] hover:text-white" />
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="size-9 text-[#71717a] hover:bg-[rgba(255,255,255,0.05)] hover:text-white">
            <Bell className="h-5 w-5" />
          </Button>
        </header>
        <main className="flex-1 overflow-x-hidden px-3 py-3 sm:px-5 sm:py-5 md:px-6">
          <div className="mx-auto w-full max-w-[1900px] min-w-0">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
