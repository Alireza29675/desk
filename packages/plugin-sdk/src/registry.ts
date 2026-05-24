import type {
  ArtifactContent,
  ArtifactTypePlugin,
  Component,
  ComponentTypePlugin,
  DeskPlugin,
  RelationTypePlugin,
} from '@desk/types';

/**
 * The runtime registry. The server owns one; the viewer owns its own
 * (renderer-side). Both consume the same plugin contracts.
 */
export class PluginRegistry {
  private readonly artifactTypes = new Map<string, ArtifactTypePlugin>();
  private readonly componentTypes = new Map<string, ComponentTypePlugin>();
  private readonly relationTypes = new Map<string, RelationTypePlugin>();

  register(plugin: DeskPlugin): void {
    switch (plugin.kind) {
      case 'artifact-type':
        this.ensureUnique(plugin.type, this.artifactTypes, 'artifact');
        this.artifactTypes.set(plugin.type, plugin);
        return;
      case 'component-type':
        this.ensureUnique(plugin.type, this.componentTypes, 'component');
        this.componentTypes.set(plugin.type, plugin as ComponentTypePlugin);
        return;
      case 'relation-type':
        this.ensureUnique(plugin.type, this.relationTypes, 'relation');
        this.relationTypes.set(plugin.type, plugin);
        return;
    }
  }

  private ensureUnique(type: string, map: Map<string, unknown>, kind: string): void {
    if (map.has(type)) {
      throw new PluginRegistryError(
        `Duplicate ${kind}-type plugin registration for type "${type}".`,
      );
    }
  }

  artifactType(type: string): ArtifactTypePlugin | undefined {
    return this.artifactTypes.get(type);
  }

  componentType(type: string): ComponentTypePlugin | undefined {
    return this.componentTypes.get(type);
  }

  relationType(type: string): RelationTypePlugin | undefined {
    return this.relationTypes.get(type);
  }

  listArtifactTypes(): ArtifactTypePlugin[] {
    return Array.from(this.artifactTypes.values());
  }

  listComponentTypes(): ComponentTypePlugin[] {
    return Array.from(this.componentTypes.values());
  }

  listRelationTypes(): RelationTypePlugin[] {
    return Array.from(this.relationTypes.values());
  }

  /**
   * Validate an artifact's content against the registered artifact type +
   * each component's plugin schema. Throws on first failure.
   */
  validateContent(artifactType: string, content: ArtifactContent): void {
    const artifactPlugin = this.artifactTypes.get(artifactType);
    if (!artifactPlugin) {
      throw new PluginRegistryError(`Unknown artifact type "${artifactType}".`);
    }
    if (artifactPlugin.allowedComponentTypes) {
      const allowed = new Set(artifactPlugin.allowedComponentTypes);
      for (const c of content.components) {
        if (!allowed.has(c.type)) {
          throw new PluginRegistryError(
            `Component type "${c.type}" is not allowed inside artifact type "${artifactType}".`,
          );
        }
      }
    }
    for (const component of content.components) {
      this.validateComponent(component);
    }
    artifactPlugin.validate?.(content);
  }

  validateComponent(component: Component): void {
    const plugin = this.componentTypes.get(component.type);
    if (!plugin) {
      throw new PluginRegistryError(`Unknown component type "${component.type}".`);
    }
    const result = plugin.schema.safeParse(component.data);
    if (!result.success) {
      throw new PluginRegistryError(
        `Component "${component.id}" (type "${component.type}") failed validation: ${result.error.message}`,
      );
    }
  }

  /**
   * Build the agent-friendly serialization of an artifact's full content.
   * Each component is delegated to its plugin's `serialize`.
   */
  serializeContent(content: ArtifactContent): SerializedContent {
    return {
      title: content.title,
      components: content.components.map((c) => {
        const plugin = this.componentTypes.get(c.type);
        if (!plugin) {
          throw new PluginRegistryError(`Unknown component type "${c.type}".`);
        }
        return { id: c.id, type: c.type, data: plugin.serialize(c) };
      }),
    };
  }
}

export interface SerializedContent {
  title: string;
  components: { id: string; type: string; data: unknown }[];
}

export class PluginRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginRegistryError';
  }
}
