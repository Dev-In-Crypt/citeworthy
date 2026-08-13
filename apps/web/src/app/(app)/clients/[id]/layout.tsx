import { ClientTabs } from "./client-tabs";

/**
 * Общая рамка всех экранов клиента: имя, домен и вкладки видны везде,
 * поэтому с любого экрана видно, где ты и куда ещё можно уйти.
 */
export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <ClientTabs clientId={id} />
      {children}
    </>
  );
}
