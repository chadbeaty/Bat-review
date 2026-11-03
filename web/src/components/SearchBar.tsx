/** The chalkboard / scoreboard search box. */
export function SearchBar({ id = "site-search", large = false, defaultValue = "" }: { id?: string; large?: boolean; defaultValue?: string }) {
  return (
    <form action="/shop" method="get" role="search" className="board">
      <label htmlFor={id} className="sr-only">
        Search equipment
      </label>
      <input
        id={id}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Search bats, gloves, brands, models"
        autoComplete="off"
        className={large ? "!py-4 !text-base" : ""}
      />
      <button type="submit" className={large ? "!px-6 !text-sm" : ""}>
        Search
      </button>
    </form>
  );
}
