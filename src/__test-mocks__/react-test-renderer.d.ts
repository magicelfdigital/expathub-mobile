declare module "react-test-renderer" {
  export interface ReactTestInstance {
    type: any;
    props: Record<string, any>;
    parent: ReactTestInstance | null;
    children: Array<ReactTestInstance | string>;
    find(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance;
    findAll(
      predicate: (node: ReactTestInstance) => boolean,
      opts?: { deep?: boolean },
    ): ReactTestInstance[];
    findByType(type: any): ReactTestInstance;
    findAllByType(type: any, opts?: { deep?: boolean }): ReactTestInstance[];
    findByProps(props: Record<string, any>): ReactTestInstance;
    findAllByProps(props: Record<string, any>): ReactTestInstance[];
    instance: any;
  }
  export interface ReactTestRenderer {
    root: ReactTestInstance;
    toJSON(): any;
    toTree(): any;
    update(element: any): void;
    unmount(): void;
  }
  function create(element: any, options?: any): ReactTestRenderer;
  export function act(cb: () => void | Promise<void>): Promise<void> | void;
  const TestRenderer: { create: typeof create; act: typeof act };
  export { create };
  export default TestRenderer;
}
