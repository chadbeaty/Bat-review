import { SearchIcon } from "@/components/icons";

/** The chalkboard / scoreboard search box. Tall enough to tap; the text never clips on a phone. */
export function SearchBar({
  id = "site-search",
  large = false,
  defaultValue = "",
  action = "/bats",
  placeholder = "Search bats or models",
}: {
  id?: string;
  large?: boolean;
  defaultValue?: string;
  action?: string;
  placeholder?: string;
}) {
  return (
    <form action={action} method="get" role="search" className="board">
      <label htmlFor={id} className="sr-only">
        Search bats
      </label>
      <input
        id={id}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        className={large ? "!min-h-14 !text-base" : ""}
      />
      <button type="submit" aria-label="Search" className={large ? "!px-6 !text-sm" : ""}>
        <SearchIcon size={20} className="sm:hidden" />
        <span className="hidden sm:inline">Search</span>
      </button>
    </form>
  );
}
