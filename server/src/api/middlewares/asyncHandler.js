/** Évite les try/catch répétés dans chaque contrôleur async. */
export function asyncHandler(controller) {
  return (req, res, next) => {
    Promise.resolve(controller(req, res, next)).catch(next);
  };
}
