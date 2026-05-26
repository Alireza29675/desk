import { PluginRegistry } from '@desk/plugin-sdk';
import { builtinPlugins } from '@desk/plugins-builtin';
import { type ReactNode, createContext, useContext } from 'react';

export function buildViewerRegistry(): PluginRegistry {
  const registry = new PluginRegistry();
  for (const plugin of builtinPlugins) registry.register(plugin);
  return registry;
}

const RegistryContext = createContext<PluginRegistry | null>(null);

export function RegistryProvider({
  registry,
  children,
}: {
  registry: PluginRegistry;
  children: ReactNode;
}) {
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

export function useRegistry(): PluginRegistry {
  const ctx = useContext(RegistryContext);
  if (!ctx) throw new Error('useRegistry must be used inside <RegistryProvider>.');
  return ctx;
}
