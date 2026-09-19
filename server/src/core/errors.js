/**
 * Erreur de domaine — `core/` ne doit rien connaître d'Express (cf.
 * api/middlewares/errorHandler.js pour la frontière HTTP). Porte un
 * `status` optionnel que la couche api/ traduit en code de réponse ; sans
 * `status`, se comporte comme une erreur 500 générique. Le `code` optionnel
 * permet à un appelant de distinguer deux échecs de même statut (ex. une
 * réponse IA incomplète pour UNE équipe, vs une panne d'API qui touche
 * toutes les suivantes).
 */
export class DomainError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
