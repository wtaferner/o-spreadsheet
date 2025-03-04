- [Adding a new custom function](#adding-a-new-custom-function)
  - [Compute function](#compute-function)
  - [Compute format function](#compute-format-function)
  - [Argument definition](#argument-definition)
    - [Lazy arguments](#lazy-arguments)
    - [Repeating arguments](#repeating-arguments)
  - [Argument types](#argument-types)
  - [Export to xlsx file](#export-to-xlsx-file)
- [Raising an error](#raising-an-error)
- [Casting and converting arguments](#casting-and-converting-arguments)
- [Looping over arguments](#looping-over-arguments)
  - [Processing all values of a specific reference argument](#processing-all-values-of-a-specific-reference-argument)
  - [Processing all values of all arguments at once](#processing-all-values-of-all-arguments-at-once)
- [Custom external dependency](#custom-external-dependency)
- [Asynchronous function](#asynchronous-function)

## Adding a new custom function

The `addFunction` method takes a name, and a function description which should
implement the [`AddFunctionDescription`](https://github.com/odoo/o-spreadsheet/blob/49285322f75dda2d5bab4aea04daa2a3d6c28370/src/types/functions.ts#L31) interface.

Below is a skeleton example to add a new function.

```ts
const { addFunction } = spreadsheet;

const MY_FUNC = {
  description: "...",
  compute: ...,
  computeFormat: ...,
  args: ...
  returns: ...,
};
addFunction("MY.FUNC", MY_FUNC);
```

The properties of a function are:

| property                                    | type                         |                                                                           |
| ------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| `description`                               | string                       | function description shown as help for the user when he types the formula |
| [`compute`](#compute-function)              | function                     | function called to evaluate the formula value                             |
| [`computeFormat`](#compute-format-function) | function (optional)          | function called to evaluate the formula format.                           |
| [`args`](#argument-definition)              | ArgDefinition[]              | arguments the user has to provide, in order.                              |
| `returns`                                   | [[ArgType](#argument-types)] | function return type                                                      |
| [`isExported`](#export-to-xlsx-file)        | boolean (default=false)      | mark the function as exportable to Microsoft Excel                        |

Let's take a look at each property one by one.

### Compute function

The `compute` property is a javascript function called to actually compute the function.
It receives its arguments' values and should return the function result.

```ts
const CELSIUS_TO_FAHRENHEIT = {
  args(`temperature_in_celsius (number) a temperature, expressed in celsius.`)
  compute: function (temperatureInCelsius) {
    return (temperatureInCelsius * 1.8) + 32;
  }
  ...,
};
addFunction("CELSIUS.TO.FAHRENHEIT", CELSIUS_TO_FAHRENHEIT);
```

Dependencies are resolved automatically and already computed. Given the formula
`=CELSIUS.TO.FAHRENHEIT(A1)` and the value of `A1` being `21`.
When the `compute` function above is called, `temperatureInCelsius` value is `21`

> The functions `compute` and `computeFormat` are **_called after any change on a sheet_**
> during the evaluation of a worksheet. The execution of compute is synchronous, so the user
> will be stuck until all the compute functions execute completely.
> That means that **_it should be fast_**..

### Compute format function

`computeFormat` function returns a format used to display the function result.

It takes the same number of parameters as `compute`, but as an object `{ value, format }`
which has the [Arg](https://github.com/odoo/o-spreadsheet/blob/49285322f75dda2d5bab4aea04daa2a3d6c28370/src/types/misc.ts#L166) interface.

If an argument comes from a reference cell, `format` is the cell format.
If the argument value is the result of another function, `format` is the result
of that function `computeFormat`.

Note that a user-defined format takes precedence over the computed format

It can be used to

- **Force a given format**

  The `DATE` function below forces its result to be displayed as a date.

```ts
const DATE = {
  description: "Converts year/month/day into a date.",
  args: args(`
    year (number) The year component of the date.
    month (number) The month component of the date.
    day (number) The day component of the date.
  `),
  computeFormat: () => "m/d/yyyy",
  returns: ["DATE"],
  compute: function(year, month, day) { ... },
}
```

- **Preserve an argument format**

  The `UMINUS` function below preserves its argument format, be it a cell reference
  format (`=UMINUS(A1)`) or the return format of another function (`=UMINUS(CEILING(1.2))`)

```ts
const UMINUS = {
  description: "A number with the sign reversed.",
  args: args(`
    value (number) The number to have its sign reversed. Equivalently, the number to multiply by -1.
  `),
  computeFormat: (value) => value?.format,
  returns: ["NUMBER"],
  compute: function (value) {
    return -toNumber(value);
  },
};
```

### Argument definition

Arguments are declared using a string-based syntax `"<arg name> (<arg type>, <other attributes>) <description>"`
which is interpreted by the `args` function.

```ts
const { args } = spreadsheet.helpers.args; // get the args function

const MY_FUNC = {
  args: args(`
    first_param (string) description of first parameter
    second_param (boolean, optional, default=false) description of second parameter
  `),
  compute: function (firstParam, secondParam) {
    ...
  }
  ...,
};
```

The table below shows all attributes.

| property                            | type                       |                                                           |
| ----------------------------------- | -------------------------- | --------------------------------------------------------- |
| `type`                              | [ArgType](#argument-types) | the argument type                                         |
| `optional`                          | boolean (default=false)    | defines that a parameters is optional                     |
| [`repeating`](#repeating-arguments) | boolean (default=false)    | accept multiple parameters of the same type               |
| [`lazy`](#lazy-arguments)           | boolean (default=false)    | this parameter will not be evaluated until it is accessed |
| `default`                           | any                        | default value of a parameter if it is not defined         |

Arguments without additional attribute must be first, then with `optional` or `default` and finally `repeating` arguments.

> With `repeating` and `default` attributes, `optional` can be omitted.

Note that you can use a long version of these parameters without using the `args` function.

```ts
args(`
  first_param (string) description of first parameter
  second_param (boolean, default=false) description of second parameter
`);
```

is equivalent to

```ts
[
  {
    name: "first_param",
    type: "string",
    description: "description of first parameter",
  },
  {
    name: "second_param",
    type: "boolean",
    description: "description of second parameter",
    optional: true,
    default: true,
    defaultValue: false,
  },
];
```

#### Lazy arguments

If a parameter is defined as `lazy`, you must call it as a function to get its value.

It can be used to

- **Ignore errors from an unused parameter**

  In the `IF` function below, the argument `valueIfFalse` is never used
  if `logicalExpression` is `true`. It should not computed eagerly. Otherwise
  the `IF` function will result in an `#ERROR` if `valueIfFalse` itself results with an error.

```ts
const IF = {
  description: "Returns value depending on logical expression.",
  args: args(`
    logical_expression (boolean) An expression or reference to a cell containing an expression that represents some logical value, i.e. TRUE or FALSE.
    value_if_true (any, lazy) The value the function returns if logical_expression is TRUE.
    value_if_false (any, lazy) The value the function returns if logical_expression is FALSE.
  `),
  returns: ["ANY"],
  compute: function (logicalExpression, valueIfTrue, valueIfFalse) {
    const result = toBoolean(logicalExpression) ? valueIfTrue() : valueIfFalse();
    return result;
  },
  isExported: true,
};
```

- **Catch possible errors from a parameter**

  The `IFERROR` function below catches any error resulting from its input

```ts
export const IFERROR = {
  description: "Whether a value is an error.",
  args: args(`value (any, lazy) The value to be verified as an error type.`),
  returns: ["BOOLEAN"],
  compute: function (value): boolean {
    try {
      value();
      return false;
    } catch (e) {
      return true;
    }
  },
  isExported: true,
};
```

#### Repeating arguments

Repeating arguments are used to accept a variable number of arguments. It can be translated to a rest parameter in the javascript `compute` function.

The `SUM` function below receives one argument (`value1`) and any number of additional arguments (`value2`).

```ts
const SUM = {
  description: "Sum of a series of numbers and/or cells.",
  args: args(`
      value1 (number, range<number>) The first number or range to add together.
      value2 (number, range<number>, repeating) Additional numbers or ranges to add to value1.
    `),
  returns: ["NUMBER"],
  compute: function (...values: ArgValue[]): number {
    ...
  },
};
```

> You can use **multiple repeating arguments**

### Argument types

[`ArgType`](https://github.com/odoo/o-spreadsheet/blob/49285322f75dda2d5bab4aea04daa2a3d6c28370/src/types/functions.ts#L4)

An argument can be a single value or a 2D matrix of values when working on ranges (e.g. `SUM(A1:A10)`).

The basic values can be `"ANY"`, `"BOOLEAN"`, `"DATE"`, `"NUMBER"` or `"STRING"`.

With their range counter part being: `"RANGE"`, `"RANGE<BOOLEAN>"`, `"RANGE<DATE>"`, `"RANGE<NUMBER>"` or `"RANGE<STRING>"`.

An error is raised automatically if a range is given to a function which expect a single value.

`"META"` is a special type. A `"META"` parameter is a reference that is not processed by o-spreadsheet.
Ex: in `=row(A1)` where the parameter of `row` is defined as meta, the compute function will receive the
string `"A1"` in its first parameter, and not the value of the cell A1.

### Export to xlsx file

`isExported: true` marks the function as exportable in Microsoft Excel. If set to `false`, cells
with formula containing the function will be exported with its result as a static value.

> ⚠ warning: If you are using `isExported: true`, make sure that both the function name and
> behaviour you defined match those in Microsoft Excel.

## Raising an error

Throwing an error in the `compute` function put the cell in `#ERROR` with a specified error message.

The special string [[FUNCTION_NAME]] will be replaced by the actual function name before showing
it to the user, so you can define utility functions and reuse them to validate arguments.

```ts
const NEW_FORMULA = {
  compute : function (value1, value2)  {
    if (value1 === 0 && value2 === 0) {
      throw new Error ("function [[FUNCTION_NAME]] expect at least a non-zero value")
    }
    // ...
  }
  ...,
}
```

## Casting and converting arguments

See [src/functions/helpers.ts](../src/functions/helpers.ts)

Takes a value and converts it to the specific type, taking o-spreadsheet specific considerations into account

- `toNumber`(value: any): number
- `toString`(value: any): string
- `toBoolean`(value: any): boolean
- `strictToBoolean`(value: any): boolean
- `strictToNumber`(value: any): number

## Looping over arguments

See [src/functions/helpers.ts](../src/functions/helpers.ts)

Most formula can take cell references as argument, ranges or list of ranges, like `=sum(A2)`, `=sum(a2,b5)` and `=sum(a2,a3, a5:b10)`.
Treating arguments of type Range is difficult because the `compute` function doesn't know in
advance the kind of reference the user will use it their formula.
These helpers will treat all cases and call a sub-function on every value referenced in the formula.

### Processing all values of a specific reference argument

- `visitAny`(arg: any, callback: (cellValue: any) => void): void

```javascript
export const WORKDAY_INTL = {
  description: Net working days between two dates (specifying weekends).,
  args: args(`
    start_date (date) The date from which to begin counting.
    num_days (number) The number of working days to advance from start_date. If negative, counts backwards.
    weekend (any, default=1) A number or string representing which days of the week are considered weekends.
    holidays (date, range<date>, optional) A range or array constant containing the dates to consider holidays. // <--
  `),
  returns: ["DATE"],
  compute: function (startDate: any, numDays: any, weekend: any = 1, holidays: any = undefined): number {
    // [...]
    let timesHoliday = new Set();
    if (holidays !== undefined) { // <--
      // if the user provided any holidays, all of them will be added to timesHoliday set, no matter how the user entered them
      visitAny(holidays, (h) => {
        const holiday = toJseDate(h);
        timesHoliday.add(holiday.getTime());
      });
    }
    // [...]
```

### Processing all values of all arguments at once

Useful when all arguments must have the same processing, and ignore values that cannot be converted to a certain type.

- `visitNumbers`(args: IArguments | any[], callback: (arg: number) => void): void

```javascript
export const MEDIAN: AddFunctionDescription = {
  description: "Median value in a numeric dataset.",
  args: args(`
    value1 (any, range) The first value or range to consider when calculating the median value.
    value2 (any, range, repeating) Additional values or ranges to consider when calculating the median value.
  `),
  returns: ["NUMBER"],
  compute: function (value1: ArgValue, value2: ArgValue): number {
    let data: any[] = [];
    visitNumbers([value1, value2], (arg) => {
      data.push(arg);
    });
    return centile([data], 0.5, true);
  },
};
```

- `visitNumbersTextAs0`(args: IArguments | any[], callback: (arg: number) => void): void
- `visitBooleans`(args: IArguments, callback: (a: boolean) => boolean): void

see [add plugin](../doc/extending/plugin.md)

## Custom external dependency

You can provide any custom external dependencies to your functions in the `Model`'s config. They are given to the function evaluation context.

Let's say you have a `user` service with the currently logged in user.
The example below shows how the service can be used in a custom function.

```ts
const model = new Model(data, {
  custom: {
    userService: services.user,
  },
});
addFunction("USER.NAME", {
  description: "Return the current user name",
  compute: function () {
    return this.userService.getUserName();
  },
  args: args(``),
  returns: ["STRING"],
});
```

## Asynchronous function

Function are synchronous. However, you can use a `getter` to fetch data from an [external source](#external-dependency).
Here is what a function fetching currency rate from a server might look like.

```ts
addFunction("CURRENCY.RATE", {
  description:
    "This function takes in two currency codes as arguments, and returns the exchange rate from the first currency to the second as float.",
  compute: function (currencyFrom, currencyTo) {
    const from = toString(currencyFrom);
    const to = toString(currencyTo);
    const currencyRate = this.getters.getCurrencyRate(from, to);
    if (currencyRate.status === "LOADING") {
      throw new Error("Loading...");
    }
    return currencyRate.value;
  },
  args: args(`
    currency_from (string) First currency code.
    currency_to (string) Second currency code.
  `),
  returns: ["NUMBER"],
});
```

And add a [plugin](./extending/architecture.md#plugins) to handle data loading.

```ts
const { uiPluginRegistry } = o_spreadsheet.registries;
const { UIPlugin } = o_spreadsheet;

class CurrencyPlugin extends UIPlugin {
  static getters = ["getCurrencyRate"];

  constructor(config) {
    super(config);

    /**
     * You can add whatever you need to the `config.custom` property at the model
     * creation
     */
    this.server = config.custom.server;

    // a cache to store fetched rates
    this.currencyRates = {};
  }

  getCurrencyRate(from: string, to: string) {
    const value = this.getFromCache(from, to);
    if (value !== undefined) {
      return value;
    }
    // start fetching the data
    this.server.fetchCurrencyRate(from, to).then((result) => {
      this.setCacheValue(from, to, result);
      // don't forget to trigger a new evaluation when the data is loaded!
      this.dispatch("EVALUATE_CELLS");
    });
    // return synchronously
    return { status: "LOADING" };
  }

  private getFromCache(from: string, to: string) {
    const cacheKey = `${from}-${to}`;
    if (cacheKey in this.currencyRates) {
      return this.currencyRates[cacheKey];
    }
    return undefined;
  }

  private setCacheValue(from: string, to: string, value: number) {
    const cacheKey = `${from}-${to}`;
    this.currencyRates[cacheKey] = { value: result, status: "COMPLETED" };
  }
}

uiPluginRegistry.add("currencyPlugin", CurrencyPlugin);
```
