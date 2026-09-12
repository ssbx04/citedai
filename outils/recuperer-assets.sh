#!/usr/bin/env bash
# Les modeles pesent 221 Mo : trop pour un depot git, GitHub refusant tout
# fichier au-dela de 100 Mo. Ils vivent dans une release et sont recuperes ici.
set -euo pipefail

VERSION="${VERSION_ASSETS:-v1}"
DEPOT="${DEPOT_GITHUB:-ssbx04/citedai}"
ARCHIVE="https://github.com/${DEPOT}/releases/download/${VERSION}/assets.tar.gz"

if [ -f app/modeles/selecteur/onnx/model_quantized.onnx ]; then
  echo "assets déjà présents"
  exit 0
fi

echo "récupération de ${ARCHIVE}"
curl -fSL --retry 3 "$ARCHIVE" -o /tmp/assets.tar.gz
tar xzf /tmp/assets.tar.gz -C app
rm /tmp/assets.tar.gz

for fichier in \
  app/modeles/selecteur/onnx/model_quantized.onnx \
  app/modeles/classifieur/onnx/model_quantized.onnx \
  app/biblio/ort-wasm-simd-threaded.jsep.wasm \
  app/donnees/corpus.json
do
  [ -f "$fichier" ] || { echo "manquant : $fichier"; exit 1; }
done
echo "assets en place"
