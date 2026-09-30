export function plannerResourceSnapshot(snapshot, resource) {
  return snapshot?.resource === resource ? snapshot.state : resource.state;
}
