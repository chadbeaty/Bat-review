export function SearchBar({ id = "site-search", large = false, defaultValue = "" }: { id?: string; large?: boolean; defaultValue?: string }) {
  return (
    <form action="/shop" method="get" role="search" className="flex w-full gap-2">
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
        className={`input min-w-0 flex-1 ${large ? "py-3.5 text-lg" : ""}`}
      />
      <button type="submit" className={`btn btn-primary ${large ? "px-6 text-base" : ""}`}>
        Search
      </button>
    </form>
  );
}
