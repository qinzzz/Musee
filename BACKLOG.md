# Backlog

## Museum association

- Allow a user to manually assign, replace, or clear an artwork's capture location, including places without a museum entity. Keep the relationship scoped to the capture venue—not artwork ownership or provenance—and record user decisions so future automatic resolution does not overwrite them. This is milestone M1 of the [Camera Roll Import Roadmap](CAMERA_ROLL_IMPORT_ROADMAP.md), which owns the implementation sequence and testing gates.
- Give each canonical physical museum its own first-class detail page, parallel to artwork and artist pages. Use a stable route such as `/museums/{museum_entity_id}` and include venue identity, thumbnail and attribution, the user's recorded artworks, first/last recorded dates, and—once modeled—visits, stamps, achievements, and location context. Preserve `/museums` as the index rather than treating its query-filter view as the final museum detail experience.
