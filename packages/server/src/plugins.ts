import { PluginRegistry } from '@desk/plugin-sdk';
import { builtinPlugins } from '@desk/plugins-builtin';
import type { DeskPlugin } from '@desk/types';

/**
 * Build a registry with the v1 vocabulary pre-loaded. Callers can pass extra
 * plugins (e.g. third-party packages loaded from the user's Desk config) and
 * they are registered after the built-ins so duplicate types are caught.
 */
export function buildRegistry(extra: DeskPlugin[] = []): PluginRegistry {
  const registry = new PluginRegistry();
  for (const plugin of builtinPlugins) registry.register(plugin);
  for (const plugin of extra) registry.register(plugin);
  return registry;
}
