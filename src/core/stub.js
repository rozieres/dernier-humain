const STUB = Symbol('stub');

export function createStub(name) {
  const target = function stub() {};
  const proxy = new Proxy(target, {
    get(_, prop) {
      if (prop === STUB) return true;
      if (prop === 'then') return (resolve) => resolve?.(undefined);
      if (prop === Symbol.toPrimitive) return (hint) => (hint === 'string' ? '' : 0);
      if (prop === Symbol.iterator) return function* empty() {};
      if (prop === Symbol.asyncIterator) return async function* empty() {};
      if (prop === Symbol.toStringTag) return `Stub(${name})`;
      if (prop === 'valueOf') return () => 0;
      if (prop === 'toString') return () => '';
      if (prop === 'toJSON') return () => null;
      if (prop === 'length') return 0;
      if (prop === 'isStub') return true;
      if (prop === 'stubName') return name;
      return proxy;
    },
    set: () => true,
    has: (_, prop) => prop === 'prototype' || prop === STUB,
    deleteProperty: () => true,
    apply: () => proxy,
    construct: () => proxy,
  });
  return proxy;
}

export const isStub = (value) => Boolean(value && (typeof value === 'object' || typeof value === 'function') && value[STUB] === true);
