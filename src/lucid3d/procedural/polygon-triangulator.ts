import earcut from 'earcut';
import { Vector2 } from '../Math/Vector2';
import { PolygonFace } from './procedural-mesh';

export interface TriangulationResult {
  vertices: number[]; // flattened [x0, y0, x1, y1, ...]
  holeIndices: number[];
  indices: number[];
}

export function triangulatePolygon(face: PolygonFace): TriangulationResult {
  const vertices: number[] = [];
  const holeIndices: number[] = [];

  const pushLoop = (loop: Vector2[]) => {
    for (const vertex of loop) {
      vertices.push(vertex.x, vertex.y);
    }
  };

  pushLoop(face.outer);
  if (face.holes) {
    let offset = face.outer.length;
    for (const hole of face.holes) {
      holeIndices.push(offset);
      pushLoop(hole);
      offset += hole.length;
    }
  }

  if (vertices.length < 6) {
    throw new Error('Polygon must have at least three vertices.');
  }
  const indices = earcut(vertices, holeIndices.length ? holeIndices : undefined, 2);
  return { vertices, holeIndices, indices: Array.from(indices) };
}
