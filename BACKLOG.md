# Backlog

## Museum association

- Allow a user to manually assign, replace, or clear the physical museum associated with each saved artwork. Keep the relationship scoped to the capture venue—not artwork ownership or provenance—and record that the final assignment came from the user so future automatic resolution does not overwrite it.
- Give each canonical physical museum its own first-class detail page, parallel to artwork and artist pages. Use a stable route such as `/museums/{museum_entity_id}` and include venue identity, thumbnail and attribution, the user's recorded artworks, first/last recorded dates, and—once modeled—visits, stamps, achievements, and location context. Preserve `/museums` as the index rather than treating its query-filter view as the final museum detail experience.
