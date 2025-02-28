
# Markdown Object Notation


## purpose

This is a sketch of a new human-readable data format. MON is meant to be easily converted to/from JSON and related formats, but be easier for humans to read and write with a text editor. It has similar goals to TOML and YAML, but is meant to handle **deeply nested** data in a more readable way than those formats.

I do think MON is better than current formats, but usually, new programming/data languages need backing from a major institution or celebrity-engineer to get established. However, you can use the code here to convert MON to JSON today, and that might be easier than writing JSON other ways.


## current implementation

An initial implementation is available [here](https://github.com/bhauth/MON). Usage:

- install Node if you haven't
- cd \[directory\]
- npm install
- node monConverter.js \[one or more files\]

That generates .json files from the input files.

Note that Node takes hundreds of milliseconds to start up. Bun starts up ~2x as fast as Node, but either way you want to batch processing.


## VS existing formats

### JSON

#### problems for humans

Deep nesting with parentheses is hard to read. People aren't good at keeping track of where in the hierarchy they are. That's why people use indentation, but then either you have significant whitespace (eg Python) or 2 systems with potential mismatch. Also, deep nesting means indentation takes up a lot of space, and it's hard to see the exact depth of deep indentation.

Lisp has the same problem, which is why it's not the most popular programming language. Instead of using () for everything, it's better to use multiple labels for demarcating blocks to indicate what's starting and ending.

JSON doesn't have comments, and I think it should.

I don't like being forced to quote keys.


### YAML

YAML is complex, whitespace-sensitive, and does implicit conversions that can cause bugs. Various people have written [posts](https://hitchdev.com/strictyaml/why/implicit-typing-removed/) about [problems](https://ruudvanasseldonk.com/2023/01/11/the-yaml-document-from-hell) using YAML can cause.

### TOML

Tom Preston-Werner, the founder of GitHub, recognized the issues with deep nesting, and designed TOML to avoid them. Here's an example of TOML from its site:

	[servers]

	[servers.alpha]
	ip = "10.0.0.1"
	role = "frontend"

	[servers.beta]
	ip = "10.0.0.2"
	role = "backend"

The problem with that approach is, repeating long sequences is bad. Suppose the example above is deeply nested inside other stuff. Then, it becomes:

	[many.levels.deep.nested.stuff.servers.alpha]
	ip = "10.0.0.1"
	role = "frontend"

	[many.levels.deep.nested.stuff.servers.beta]
	ip = "10.0.0.2"
	role = "backend"

You probably see the problem here. I still consider that an improvement over editing JSON as text, but it's not ideal.


## Markdown

There's already a popular format that solves some of the above problems: Markdown. The only problem is, there's no standardized way to use it as a data container.

Markdown is generally credited to [John Gruber](https://daringfireball.net/projects/markdown/syntax), but personally I'd give more credit to [Aaron Swartz](https://en.wikipedia.org/wiki/Aaron_Swartz). Aaron is better-known for co-founding Reddit and for how he died, but he also designed [atx](http://www.aaronsw.com/2002/atx/intro.html), which has all the key elements of Markdown. Personally, I think the design of Gruber's additions is more questionable.

So, this post and design is dedicated to Aaron Swartz.


## MON features

Let's look at how test_data.mon is processed.

    - cd \[directory\]
    - node monConverter.js test_data.mon

That produces a test_data.json file. Let's compare it to the input.

### key-value pairs

	root_item = ["nested", ["bracket", ["array"]]]
    
    🡺 
    
    "root_item": [
      "nested",
      [
        "bracket",
        [
          "array"
        ]
      ]
    ],
    
We can use key-value pairs, and data in nested brackets.

### section headers

    # alpha
    "a"
    
    # beta
    true
    [false, null]
    
    🡺 
    
    "alpha": "a",
    "beta": [
      true,
      [
        false,
        null
      ]
    ],

We can put one or more items under # headers. If there are multiple items, they're put into an array. (The other ways to define arrays are preferred, because they're clearer and can mix in key-value pairs with data.)

Like in JSON, data can be a string, a float, true, false, or null.

### nesting in existing items

    # gamma
    g = "is for gamma"
    
    # gamma.deeply.nested.items
    multi_line_string = "this...
    is...
    nested."
      
    🡺 
    
    "gamma": {
      "g": "is for gamma",
      "deeply": {
        "nested": {
          "items": {
            "multi_line_string": "this...\nis...\nnested."
          }
        }
      }
    },

We can define a section, then later put data inside it that's deeply nested, as above. Header names are split by " **.** ".

### appending to arrays

    # epsilon
    
    ## array.[]
    a = "building"
    b = "an"
    
    ## array.[]
    c = "array"
    d = "up"
          
    🡺 

    "epsilon": {
      "array": [
        {
          "a": "building",
          "b": "an"
        },
        {
          "c": "array",
          "d": "up"
        }
      ]
    },

When a section is labeled **foo.[]** as above, its contents are appended to an array in **foo**.

### comment blocks

    #/ comment block
    
    ## Text here is ignored.
    Until hitting a lower-level header.

Adding **/** to the end of a **#** header makes that section and all its subsections a comment block.

### nested arrays and array insertion

    # zeta
    // This is a comment.
    // Commas produce nested values.
    - 0
    - 1
    - 2
      , 2.2
    - 3
      , 3.3
    
    # zeta.0
    "replaced zero in zeta"
              
    🡺 
    
    "zeta": [
      "replaced zero in zeta",
      1,
      [
        2,
        2.2
      ],
      [
        3,
        3.3
      ]
    ],

A line starting with **//** is a single-line comment.

Dashes produce arrays. Using commas after dashes produces nested sub-arrays.

In Javascript, strings of numbers are converted to numeric array indices when used as keys. So, we can insert data in arrays defined above.

### dittos, templates, and code blocks

    # people
    ##/ templates are not output
    ##= employee_template
    role = "employee"
    
    // ditto copies above
    ##= bob
    status = "active"
    
    ##= joe
    
    ##; code
    console.log("Send a message in a bottle.");
    return `Bob's role is ${this.bob.role}.`;
    
    #= people_copy

    🡺

    "people": {
      "bob": {
        "role": "employee",
        "status": "active"
      },
      "joe": {
        "role": "employee"
      },
      "code": "Bob's role is employee."
    },
    "people_copy": {
      "bob": {
        "role": "employee",
        "status": "active"
      },
      "joe": {
        "role": "employee"
      },
      "code": "Bob's role is employee."
    }

Using **##=** makes a section a template (if it's a first subsection) or a ditto (otherwise). A template is not output. A ditto copies the most recent non-ditto section, and can have additional data added.

Ditto sections can produce exponential amounts of data, so they're only allowed if **trust ≥ 1**.

Using **##;** makes a section a code block. Code blocks are only executed if **trust ≥ 2**.

Code blocks can access their parent section as **this** and if **trust ≥ 3** they can access the root object as **root**.

The above code block also executes a **console.log** twice, because it's copied by the ditto. Because of execution order, logging object data can sometimes fail.


## future plans

### schemas

#### architecture

MON is also meant to handle schemas for data in it. There are already several perfectly good languages for schemas, such as CUE, Dhall, and XSD, but which one to use? I decided to go with whatever has the most stars on Github, and found this thing called TypeScript with 100k stars. So, the plan is:

1. read MON files
2. compile them to TypeScript for type validation
3. compile the TypeScript to safe JS
4. execute the JS to run any schema (checks + generation) of values and produce a JS object
5. if necessary, convert the JS object to a JSON string


#### design

> According to the JSON standard, a JSON value is one of the following JSON-language data types: object, array, number, string, Boolean (true or false), or null.

Programming generally involves more data types than that, and it's useful to be able to specify your own types for data. Let's allow description of types, using the same format as TypeScript except for the "comment" type.


We also need some way to specify what new types mean.

* Type definitions use $ instead of #, chosen as a stylized S for "Schema".
* Let's prefix required fields with ! and have other fields be optional by default.

**simple example**

	$ closed_dict =   // using = indicates a closed set
    alpha : string    // Optional. Must be a string if present.
    ! beta : int     // Must be present, and must be an int.
    gamma = "a_default"  // gamma is set to "a_default" by default

    // The value of delta is set to this expression by default. It will be evaluated as javascript during processing if not overwritten
    delta = beta * beta
    
    $ open_dict :   // using : indicates an open set
    beta : int    // Beta must be an int if present.
    beta :: beta > 10   // If beta is present, (beta > 10) must be true.

    // epsilon has a default value. Trying to overwrite it with a different value is an error.
    ! epsilon = "forced_default"

    $ unlimited_float_pairs :
    // any number of unspecified field names of type Record<string,float_pair>
    [float_pair] : [float, float]
    

In the above example:

* **closed_dict** uses ' = ' so it's a closed set: elements of that type can't have additional fields.
* **open_dict** uses ' : ' so it's allowed to have additional (unspecified) fields.

As for the symbols:

- **name : type**  indicates a type which **name** must have if present.
- **! name : type**  indicates a type and makes adding the field mandatory.
- **name = expression**  sets a default value.
- **! name = expression**  sets a default value and can't be overwritten. Trying to overwrite with the same value is allowed, to allow for merging defaults.
- **name :: expression**  means that, if **name** is present, the expression must evaluate to true.
- **:: expression**  means that **expression** must always evaluate to true.
- **\[\] :** means any number of unspecified named fields of the following type may be present. If mandatory, at least 1 must be present.
- **\[type_name\] :**  is like  **\[\] :**  but also defines a new name for the specified type.

Of course, Typescript doesn't have an **int** type, so if using that is allowed, it would need to be converted to:

    beta :: Number.isInteger(beta)

Or, users could write that check directly, to simplify the parsing problem and reduce special cases.


#### schema scoping

Type definitions that are inside a section only apply to that section and its sub-sections.

##### combined schema + data example

	# servers : serverset
    
    $ serverset : 
    
    $$ [server] =
    ! ip : string
    role : string

    ## alpha : server
	ip = "10.0.0.1"
	role = "frontend"
    extra_field = 99;

	## beta : server
	ip = "10.0.0.2"
	role = "backend"

**extra_field** isn't allowed because **server** is a closed set, so the above gives an error.


#### schema safety

Schemas should only allow a subset of Typescript code:

* no functions with side effects
* no recursion

That prevents most harmful effects, but could still allow for malicious schemas that use exponential space or time. So, it might make sense to have 2 modes for processing schemas:

* a normal mode for non-malicious data
* a safe mode for potentially-malicious data, with fewer features


### file handling

To process a folder of MON files using another MON file as a schema, the code would be something like:

    MON.load([
      [schema_path, {trust: 0}],
      [data_directory, {type: "type_in_schema", trust: 0}]
    ])

The type of that would be something like:

    type inputFile = string | [string, Record<string, any>];
    type validationErrors = any[];
    type loaderType = (
      input: inputFile[]
    ) => [any, validationErrors];

The array of (files / directories) is loaded in order, and each can have a type assigned to it from previously loaded files. Untrusted files have more-limited schema features.

Since this is using Typescript already, the same function could also handle JSON files.

File data can go inside an object with that filename. If we want a file with data that goes deep inside another file, files can have names such as:

* base.mon
* base.some.nesting.mon
* base/more/nesting.mon


### logo / 紋章

Since the name is MON, maybe it could use a logo like [this](https://en.wikipedia.org/wiki/File:Family_crest_hanawachigai.png).




