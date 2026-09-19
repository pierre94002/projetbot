#!/usr/bin/env python3
# -----------------------------------------------------------------------------
# import_player_team_stats.py
# -----------------------------------------------------------------------------
# Recupere les statistiques individuelles JOUEURS et les statistiques
# d'EQUIPE (saison par saison) pour les 5 grands championnats europeens
# ("Big 5" : Premier League, La Liga, Serie A, Bundesliga, Ligue 1) sur les
# 5 dernieres saisons, depuis FBref (Sports Reference), via la librairie
# open-source `soccerdata`.
#
# Complete le script Node `import-historical-matches.mjs` (qui recupere les
# RENCONTRES et calcule les CLASSEMENTS depuis football-data.co.uk) : ce
# script-ci fournit le niveau de detail JOUEUR (buts, passes decisives,
# xG/xA, tirs, passes, actions defensives, possession, gardiens, etc.)
# necessaire par ex. aux ponderations xGOT/gardien et facteurs tactiques
# du moteur Cote Master.
#
# Pre-requis (a executer une seule fois, sur une machine avec acces internet
# normal - PAS dans le bac a sable Claude, qui bloque ces domaines) :
#   pip install soccerdata pandas
#
# Usage :
#   python import_player_team_stats.py
#
# Sortie (creee automatiquement, a cote de ce script) :
#   data/fixtures/historique/joueurs/<saison>/<type-stat>.csv
#   data/fixtures/historique/equipes/<saison>/<type-stat>.csv
#
# Source : https://fbref.com (Sports Reference) - reutilisation autorisee
# pour usage non commercial / recherche avec attribution ; au-dela (usage
# commercial pour un syndicat de paris), verifier leurs conditions ou
# passer par une API sous licence (ex. API-Football, Enetpulse).
# -----------------------------------------------------------------------------

import sys
from pathlib import Path

try:
    import soccerdata as sd
except ImportError:
    sys.exit(
        "Le module 'soccerdata' n'est pas installe.\n"
        "Lance d'abord : pip install soccerdata pandas"
    )

OUT_DIR = Path(__file__).resolve().parent / "data" / "fixtures" / "historique"

# 5 dernieres saisons (2021-22 -> 2025-26 en cours), format soccerdata.
SEASONS = ["2122", "2223", "2324", "2425", "2526"]

# "Big 5 European Leagues Combined" = Premier League, La Liga, Serie A,
# Bundesliga, Ligue 1 recuperees en une seule fois par FBref (bien plus
# rapide/robuste que 5 requetes separees).
LEAGUE = "Big 5 European Leagues Combined"

# Types de stats joueurs/equipes confirmes par la doc soccerdata pour
# read_player_season_stats / read_team_season_stats. FBref expose aussi
# passing/defense/possession sur le site : si ta version de soccerdata les
# supporte, ajoute-les simplement a cette liste (le script ignore
# proprement un type non supporte plutot que de planter).
STAT_TYPES = ["standard", "shooting", "playing_time", "keeper", "misc"]


def save(df, out_path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path)
    print(f"   -> {out_path}  ({len(df)} lignes)")


def main():
    for season in SEASONS:
        print(f"\n=== Saison {season} ===")
        try:
            fbref = sd.FBref(leagues=LEAGUE, seasons=season)
        except Exception as e:
            print(f"   Saison {season} indisponible ou pas encore commencee : {e}")
            continue

        # --- Rencontres / calendrier (recoupe le script Node, utile pour
        # croiser les IDs FBref avec football-data.co.uk si besoin) ---
        try:
            schedule = fbref.read_schedule()
            save(schedule, OUT_DIR / "calendrier" / season / "schedule.csv")
        except Exception as e:
            print(f"   [calendrier] echec : {e}")

        # --- Stats joueurs ---
        for stat_type in STAT_TYPES:
            try:
                df = fbref.read_player_season_stats(stat_type=stat_type)
                save(df, OUT_DIR / "joueurs" / season / f"{stat_type}.csv")
            except Exception as e:
                print(f"   [joueurs/{stat_type}] non disponible : {e}")

        # --- Stats equipes ---
        for stat_type in STAT_TYPES:
            try:
                df = fbref.read_team_season_stats(stat_type=stat_type)
                save(df, OUT_DIR / "equipes" / season / f"{stat_type}.csv")
            except Exception as e:
                print(f"   [equipes/{stat_type}] non disponible : {e}")

    print("\nTermine.")
    print(
        "Astuce : `soccerdata.FBref.available_leagues()` liste tous les "
        "identifiants de championnats geres par FBref (utile pour ajouter "
        "la Ligue des Champions / Europa League individuellement si tu en "
        "as besoin - elles ne sont pas incluses dans 'Big 5 Combined')."
    )


if __name__ == "__main__":
    main()
