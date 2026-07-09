import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getUser } from '@/lib/supabase/auth';
import { LoginForm } from './login-form';
import { HexagonBackground } from '@/components/animate-ui/components/backgrounds/hexagon';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getUser();
  if (user) {
    redirect('/dashboard');
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background p-4">
      <HexagonBackground className="absolute inset-0" hexagonSize={75} hexagonMargin={3} />
      <div className="relative z-10 w-full max-w-md">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
