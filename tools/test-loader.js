export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !specifier.endsWith('.ts') &&
    !specifier.endsWith('.js') &&
    !specifier.endsWith('.json')
  ) {
    try {
      return await nextResolve(specifier + '.ts', context);
    } catch {
      // ignore
    }
  }
  return nextResolve(specifier, context);
}
