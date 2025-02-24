
# Markdown Object Notation


## purpose

This is a sketch of a new human-readable data format. I do think it's better than existing ones, but usually, new programming/data languages need backing from a major institution or celebrity-engineer to get established. So, this is mostly just a thought exercise.

MON is meant to be a format for data that's easily converted to/from JSON and related formats, but be easier for humans to read and write with a text editor. It has similar goals to TOML and YAML, but is meant to handle **deeply nested** data in a more readable way than those formats.

MON is also meant to handle schemas for data in it. There are already several perfectly good languages for schemas, such as CUE, Dhall, and XSD, but which one to use? I decided to go with whatever has the most stars on Github, and found this thing called TypeScript with 100k stars. So, the plan is:

1. read MON files
2. compile them to TypeScript for type validation
3. compile the TypeScript to safe JS
4. execute the JS to run any schema (checks + generation) of values and produce a JS object
5. if necessary, convert the JS object to a JSON string


## current implementation

An initial implementation is available [here](https://github.com/bhauth/MON). Usage:

- install Node if you haven't
- cd \[directory\]
- npm install
- node monConverter.js \[one or more files\]

That generates .json files from the input files. Note that:
- that code is probably terrible
- it doesn't currently handle:
    - schemas
    - naming array elements to place data in them
- Node takes hundreds of milliseconds to start up


## some existing formats

### JSON

#### problems for humans

deep nesting with parentheses is hard to read

People aren't good at keeping track of where in the hierarchy they are. That's why people use indentation, but then either you have significant whitespace (eg Python) or 2 systems with potential mismatch. Also, deep nesting means indentation takes up a lot of space, and it's hard to see the exact depth of deep indentation.

same problem Lisp has. Instead of using () for everything, it's better to use multiple labels for demarcating blocks to indicate what's starting and ending.

JSON doesn't have comments, and I think it should.

#### problems for software

Some people say that JSON is meant to be handled by programs, not people, but its success comes from it being somewhat usable as plain text. If JSON isn't meant to be edited as text, then it should have length info so programs can find specific elements in a big file efficiently.

JSON encodes all numbers as decimal strings, which is inefficient. Decimal numbers can get changed when loading JSON into Javascript and then exporting it again, so some people use their own string-number conversion system.


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



## MON

There's already a popular format that solves some of the above problems: Markdown. The only problem is, there's no standardized way to use it as a data container.

### Markdown history

Markdown is generally credited to [John Gruber](https://daringfireball.net/projects/markdown/syntax),
but personally I'd give more credit to [Aaron Swartz](https://en.wikipedia.org/wiki/Aaron_Swartz). Aaron is better-known for co-founding Reddit and for how he died, but he also designed [atx](http://www.aaronsw.com/2002/atx/intro.html), which has all the key elements of Markdown. Personally, I think the design of Gruber's additions is more questionable.

So, this post and design is dedicated to Aaron Swartz.


### MON examples

Here's the above example of TOML in MON.

	# many.levels.deep.nested.stuff.servers

	## alpha
	ip = "10.0.0.1"
	role = "frontend"

	## beta
	ip = "10.0.0.2"
	role = "backend"

As in Markdown, each line without a  **\#**  header is nested in the most recent line with a  **\#**  header. Each line with a header is nested in the most recent line with a lower-level header, or (if none exists) in the root level.


Documentation of Rusty Object Notation uses this example:

	Scene(
		 materials: { // this is a map
			  "metal": (
					reflectivity: 1.0,
			  ),
			  "plastic": (
					reflectivity: 0.5,
			  ),
		 },
		 entities: [ // this is an array
			  (
					name: "hero",
					material: "metal",
			  ),
			  (
					name: "monster",
					material: "plastic",
			  ),
		 ],
	)

Here's the MON version of that:
    
	# Scene

	## materials

	### metal
	reflectivity = 1.0

	### plastic
	reflectivity = 0.5

	## entities
	- 
	name = "hero"
	material = "metal"
	- 
	name = "monster"
	material = "plastic"



## design of MON

### prefixes

Let's consider that line above:

    # many.levels.deep.nested.stuff.servers

Sections may have prefixes. If they do, they're moved to the corresponding subsection. The prefix is appended to whatever context they're written in.

This way, data doesn't become deeply nested, and sections of data can be moved without making many changes.


### arrays

Arrays can be expressed in 2 ways. One way is enclosing them in [ ] brackets:

	## some_arrays
    mine = ["one", "two", "three"]
    theirs = [,"milk" ,"eggs" ,"sugar"]
    
Inside [ ] brackets, leading commas are optional.

If an array isn't nested inside its subsection, the [ ] brackets can be omitted, IF there's a leading comma and 1 item per line. For compability with Markdown, ' - ' can be used instead of ' , ' in that case.

	## some_arrays

    ### mine
	, "one"
	, "two"
	, "three"

    ### theirs
    - "milk"
    - "eggs"
    - "sugar"

When both commas and dashes are mixed, the comma segments are considered sub-arrays of a dash array. Indentation is recommended. For example:

	- "one"
       , "two"
       , "three"
	- "four"
	   , "five"
	   , "six"

is equivalent to

	- ["one", "two", "three"]
	- ["four", "five", "six"]


#### array element names

Inside an array, an element that starts with a ' . ' is an element name. Later, that name can be used to place data there.

Example:

	### foo
    - .bar1
    - .bar2

    ### foo.bar2
    // Data here goes in the above array element bar2.


### data types

> According to the JSON standard, a JSON value is one of the following JSON-language data types: object, array, number, string, Boolean (true or false), or null.

Programming generally involves more data types than that, and it's useful to be able to specify your own types for data. Let's allow description of types, using the same format as TypeScript except for the "comment" type.

#### example of using types

	# servers : serverset

	## alpha : server
	ip = "10.0.0.1"
	role = "frontend"

	## beta : server
	ip = "10.0.0.2"
	role = "backend"

	# some_array : int[]
	, 12
	, 34
	, 56


#### comments

	// this is a single-line comment
    
	##/ this is a comment block
    This whole subsection is just a comment. The comment continues until a section header of the same or lower level.

The creator of JSON deliberately didn't include comments, but I think JSON5 adding comments shows that was a mistake.


## MON schemas

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


### schema scoping

Type definitions that are inside a section only apply to that section and its sub-sections.

#### combined schema + data example

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


### schema safety

Schemas should only allow a subset of Typescript code:

* no functions with side effects
* no recursion

That prevents most harmful effects, but could still allow for malicious schemas that use exponential space or time. So, it might make sense to have 2 modes for processing schemas:

* a normal mode for non-malicious data
* a safe mode for potentially-malicious data, with fewer features


## file handling

To process a folder of MON files using another MON file as a schema, the code would be something like:

    MON.load([schema_path, [data_directory, {type: "type_in_schema", trusted: false}]])

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


## logo / 紋章

Since the name is MON, maybe it could use a logo like [this](https://en.wikipedia.org/wiki/File:Family_crest_hanawachigai.png).




