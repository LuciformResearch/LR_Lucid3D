title: "Procedural Mesh Next Steps"

# Procedural Mesh Next Steps

Date: 2025-10-14T17:23:54+02:00
Category: Procedural
Tags: webgpu,procedural-mesh,primitives,houdini,roadmap

## Contexte

- Opérations procédurales modernisées (`ComputeQuads`, `PolyExtrude`) et primitives de base (UV sphere / icosphere) déjà disponibles.
- Besoin d’un plan clair pour pousser plus loin la génération procédurale (support de polygones complexes, sub-geometries, pipeline GPU) dans les prochaines sessions.

## Objectifs

- Capturer les axes de travail prioritaires pour poursuivre la migration Houdini-like.
- Mettre en évidence les chantiers techniques (indices 32 bits, tangentes, assets procéduraux).
- Définir une feuille de route court/moyen terme exploitable lors de la prochaine régénération de contexte.

## Changements / Analyses

1. **Sub-geometries / indices 32-bit**
   - Bridge actuel tronque au-delà de `Uint16`; prévoir découpage automatique (Unity-style) ou migration vers pipelines `uint32`.
2. **Primitives & attributs**
   - Ajouter tangentes/bitangentes correctes; doubleurs de sommets pour seams UV; options de lissage.
3. **Opérateurs avancés**
   - Ports restants : PolyExtrude variantes (inset, bevel), Smooth/Subdivide, remapping attrib.
   - Support quads n-gons (ComputeQuads généralisé, earcut holes).
4. **Node graph / serialization**
   - Définir un format de graph procédural (JSON) + éventuelle interface (debug panel ou outil externe).
5. **Tests & intégration**
   - Scénarios unitaires (polygones troués, extrusions multiples) et intégration WebGPU (buffers dynamiques, skinning plus tard).

## Résultats / Prochaines étapes

- **Prochain sprint possible** :
  1. Implémenter découpage auto en sub-geometries (>65k indices) ou pipeline `uint32`.
  2. Étendre `PolyExtrude` (inset/taper) et `ComputeQuads` (quads généralisés) avec tests.
  3. Générer des tangentes + normal-map-ready data pour les sphères.
  4. Prototyper un petit format de graph (JSON) + loader pour enchaîner des opérateurs.
  5. Consolider la doc `docs/10-procedural-mesh-roadmap.md` avec un tableau d’owner/state.

*Rapport généré par new_report*
