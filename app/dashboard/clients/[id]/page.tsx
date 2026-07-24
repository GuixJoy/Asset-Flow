'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { ClientDetail } from '@/components/clients/client-detail';
import { clientsApi, assetsApi, cyclesApi } from '@/lib/api-client';
import { Client, Asset, ServiceCycleWithPlan } from '@/types/index';

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params.id as string | undefined;

  const [client, setClient] = useState<Client | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [cycles, setCycles] = useState<ServiceCycleWithPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        console.info('[client-detail] params', params);
        if (!clientId) {
          setError('Client id is required');
          setIsLoading(false);
          return;
        }
        setError(null);
        const [clientData, assetsData, cyclesData] = await Promise.all([
          clientsApi.getById(clientId),
          assetsApi.getByClientId(clientId),
          cyclesApi.list(clientId),
        ]);
        setClient(clientData);
        setAssets(assetsData);
        setCycles(cyclesData);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load client';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [clientId]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Clients', href: '/dashboard/clients' },
            { label: 'Loading...' },
          ]}
        />
        <div className="text-center py-12">
          <p className="text-[#71717a]">Loading client details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Clients', href: '/dashboard/clients' },
            { label: 'Error' },
          ]}
        />
        <div className="text-center py-12">
          <p className="text-[#71717a]">{error}</p>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-6">
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Clients', href: '/dashboard/clients' },
            { label: 'Not found' },
          ]}
        />
        <div className="text-center py-12">
          <p className="text-[#71717a]">Client not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Clients', href: '/dashboard/clients' },
          { label: client.name },
        ]}
      />
      <ClientDetail client={client} assets={assets} cycles={cycles} onCyclesChange={setCycles} />
    </div>
  );
}
