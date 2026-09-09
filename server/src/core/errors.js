/**
 * Erreur de domaine — `core/` ne doit rien connaître d'Express (cf.
 * api/middlewares/errorHandler.js pour la frontière HTTP). Porte un
 * `status` optionnel que la couche api/ traduit en code de réponse ; sans
 * `status`, se comporte comme une erreur 500 générique.
 */
export class DomainError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.status = status;
  }
}
