import northwindUrl from './assets/tenants/northwind.svg';
import contosoUrl from './assets/tenants/contoso.svg';
import fabrikamUrl from './assets/tenants/fabrikam.svg';

const LOGOS: Record<string, string> = {
  'tenant-northwind': northwindUrl,
  'tenant-contoso': contosoUrl,
  'tenant-fabrikam': fabrikamUrl,
};

export function tenantLogo(tenantId: string | null | undefined): string | null {
  if (!tenantId) return null;
  return LOGOS[tenantId] ?? null;
}

export function TenantLogo({
  tenantId,
  size = 20,
  alt,
}: {
  tenantId: string | null | undefined;
  size?: number;
  alt?: string;
}) {
  const src = tenantLogo(tenantId);
  if (!src) {
    return (
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          borderRadius: 4,
          background: '#e5e7eb',
        }}
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt ?? ''}
      width={size}
      height={size}
      style={{ display: 'inline-block', borderRadius: 4, verticalAlign: 'middle' }}
    />
  );
}
