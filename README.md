
# Markdown Object Notation


## what it is

MON is a new human-readable data format. It's meant to:

* be easily converted to JSON
* be easier for humans to read and write with a text editor than JSON
* handle **deeply nested** data in a readable way


## use cases

### data holders

You want to store and edit a lot of structured information for a program. For example, a file containing every dialogue tree for characters in a game. You can write that as a MON file, and then convert it to JSON as part of a build step. Dittos and tags can be used to apply templates and reduce duplication.

### config files

You have a program using Javascript, perhaps a web app, and want users to be able to read and edit a complex config file. You can parse a MON config file using a 5kb standalone javascript file, and it parses quickly.

### data validation

Using subtags (see below) a MON file can automatically apply tags to sections of another MON file, causing corresponding code to run on those sections. That can be used to apply schemas to untrusted data.

### note

You shouldn't expect MON to become a standard. I do think MON is better than current formats, but usually, new programming/data languages need backing from a major institution or celebrity-engineer to get established. MON was not made to try to replace existing standards; it's just a tool that's useful now.


## current implementation

### demo

A simple web demo is [here](https://bhauth.com/files/dev/mon/).

### to run

- (install Node.js)
- [download mon.js here](https://github.com/bhauth/MON/releases)
- node mon.js \[one or more mon/json files\]

That produces .json files from .mon ones, and .mon files from .json ones. It should accept arbitrary .json files.

Sets of files can be combined as follows:

- node mon.js "file1\{parameters\}file2\{parameters\}..."

The output destination is set by the last file. See "file handling" below for advanced usage.

### to build

- download source [here](https://github.com/bhauth/MON).
- cd \[directory\]
- npm install
- npm run build

That puts **mon.js** in **/dist** and **monReader.js** in **/demo**.


## VS existing formats

### JSON

Deep nesting with parentheses is hard to read. People aren't good at keeping track of where in the hierarchy they are. That's why people use indentation, but then either you have significant whitespace (eg Python) or 2 systems with potential mismatch. Also, deep nesting means indentation takes up a lot of space, and it's hard to see the exact depth of deep indentation.

Lisp has the same problem, which is why it's not the most popular programming language. Instead of using () for everything, it's better to use multiple labels for demarcating blocks to indicate what's starting and ending.

JSON doesn't have comments, and I think it should.

I don't like being forced to quote keys.


### YAML

YAML is complex, whitespace-sensitive, and does implicit conversions that can cause bugs. Various people have written [posts](https://hitchdev.com/strictyaml/why/implicit-typing-removed/) about [problems](https://ruudvanasseldonk.com/2023/01/11/the-yaml-document-from-hell) using YAML can cause.

MON is not indentation-sensitive.

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
    - node monTool.js test_data.mon

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

### quoted keys

    'single quotes' = "allow for spaces in keys"
        
        🡺
    
    "single quotes": "allow for spaces in keys",

Keys may be quoted with single quotes. Strings must be quoted with double quotes.

### section headers

    # alpha
    "A"
    
    # beta
    bools = [true, false]
    'null' = null
    
    🡺 
    
    "alpha": "A",
    "beta": {
      "bools": [
        true,
        false
      ],
      "null": null
    },

We can put one or more values or key-value pairs under # headers. If there are multiple values, the first one is taken.

Like in JSON, values can be a string, a float, true, false, or null.

Subsections are added to their parent section as keys, so only sections that are empty or have key-value pairs may have subsections.

### text blocks

    #" Text Block
    You can freely use
    symbols like " and = in this text.
    
    ## nested text
    can go in these too.

        🡺
    
    "Text Block": "You can freely use\nsymbols like \" and = in this text.\n# nested text\ncan go in these too.",

Adding **"** to the end of a **#** header makes that section and all its subsections a text block. Subsection headers are trimmed by the starting level, to allow embedding arbitrary Markdown in them.

### comment blocks

    #/ comment block
    
    ## Text here is ignored.
    Until hitting a lower-level header.

Adding **/** to the end of a **#** header makes that section and all its subsections a comment block.

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

To use " **.** " in a header name, add a " **.** " to the end of it. When that's done, the header will not be split, and the ending " **.** " will be removed.

Nesting with headers can potentially escape schemas, so it's only allowed if **trust ≥ 0**. (See below.)

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

### nested arrays and array insertion

    # zeta
    // This is a comment.
    // Commas produce nested values.
    - 0
    - "put a 1 here"
    - 2
      , 2.2
    - 3
      , 3.3
    
    # zeta.0
    "replaced zero"
    
    # zeta.[put a 1 here]
    "a 1"

    🡺 

    "zeta": [
      "replaced zero",
      "a 1",
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

In Javascript, strings of numbers are converted to numeric array indices when used as keys. So, we can insert data at an array index.

Using  **# zeta.\[put a 1 here\]**  searches the array zeta for for the string in [ ] brackets, and replaces that item. This can be used to label array elements you'll later replace.


## optional advanced features

The existence of the below options can be ignored if you don't want to use them.

### dittos and templates

    # people
    ##/ templates are not output
    ##= employee_template
    role = "employee"
    
    // ditto copies above
    ##= bob
    status = "active"
    
    ##= joe
    
    #= people_copy

    🡺

    "people": {
      "bob": {
        "role": "employee",
        "status": "active"
      },
      "joe": {
        "role": "employee"
      }
    },
    "people_copy": {
      "bob": {
        "role": "employee",
        "status": "active"
      },
      "joe": {
        "role": "employee"
      }
    },

Using **##=** makes a section a template (if it's a first subsection) or a ditto (otherwise). A template is not output. A ditto copies the most recent non-ditto section, and can have extra data added.

Ditto sections can produce exponential amounts of data, so they're only allowed if **trust ≥ 1**.

### code blocks

    # code blocks
    
    ##; logging
    console.log("Send a message in a bottle.");
    
    ## x
    10
    
    ##; 2x
    return this.x * 2;
    
    ##; using root
    return `Bob's status is ${root.people.bob.status}.`;

    🡺

    "code blocks": {
      "x": 10,
      "2x": 20,
      "using root": "Bob's status is active."
    },

Using **##;** makes a section a code block. Code blocks are only executed if **trust ≥ 2**.

Code blocks can access their parent section as **this** and their file's root object as **root**. If **trust ≥ 3** they can access the global root object (containing all files in the set) as **groot**.

The above code block also executes a **console.log**. If it was copied by a ditto, the message would be printed twice.

### tags

Suppose you want to apply some code to multiple blocks, based on their type. We can do that with tags. A tag block is marked with **##: tag_name** and code in it is applied to every section with that tag. Sections can have multiple tags. Tag names are global. Tags must use " **:** " with spaces.

    #: some_tags
    
    ##: squared
    this.x2 = this.x ** 2;
    
    ##: cubed
    this.x3 = this.x ** 3;
    
    # numbers
    
    ## square_me : squared
    x = 10
    
    🡺

    "numbers": {
      "square_me": {
        "x": 10,
        "x2": 100
      }
    },

Here, the code in **squared** is applied to every block with the type **squared**.

### subtags

Suppose we want to automatically apply tags to subsections, based on their parent section's type and the subsection names. We can do that with subtags.

    #: funNumbers
    ## squares : myType
    ### * : squared
    ## cubes.[] : cubed
    
    # squared_numbers : funNumbers
    
    ## squares
    ### s1
    x = 6
    ### s2
    x = 5
    
    🡺

    "squared_numbers": {
      "squares": {
        "s1": {
          "x": 6,
          "x2": 36
        },
        "s2": {
          "x": 5,
          "x2": 25
        }
      }
    },

Let's go through what that means.

    #: funNumbers
    ## squares : myType

In sections tagged **funNumbers**, if there's a subsection named **squares**, apply tag **myType** to it.

    ## squares : myType
    ### * : squared

In sections tagged **myType**, if there's **any subsection** (" **\*** " matches any section name), apply tag **squared** to it.

### array subtags

If we want to apply a tag to every element of an array, we can do that by adding " **.[]** " to the section name. To match any array subsection, we can use " **\*.[]** ".

    # cubed_numbers : funNumbers
    
    ## cubes
    - x = 4
    - x = 3
    
    ## cubes.[]
    x = 2
    ## cubes.[]
    x = 1
    
    🡺

    "cubed_numbers": {
      "cubes": [
        {
          "x": 4,
          "x3": 64
        },
        {
          "x": 3,
          "x3": 27
        },
        {
          "x": 2,
          "x3": 8
        },
        {
          "x": 1,
          "x3": 1
        }
      ]
    }

### bags

Suppose you want to mark some items in a MON file for processing as a group by some function. That can be done with bags.

	# bag_item
    data = "stuff"
    
    ##> set_to_process
    parameter = "settings"

The above adds this element to a separate bags output:

    {
      "set_to_process": [
        [
          [ "bag_item" ],
          { "parameter": "settings" }
        ]
      ]
    }

Every item sent to the  **set_to_process**  bag is added to that array.


## file handling

To process some MON files using another MON file as a schema, you can run:

    mon.js "schema.mon{trust=3}file1.mon{trust=-1 tag=schema_tag}file2.mon{trust=-1 tag=schema_tag}destination.json"

The files are loaded in order. The parameters apply **schema_tag** to the top-level object of the file. Subtags can then cause a cascade of tag applications, which can trigger code that validates the sections.


### trust levels

**trust** is a parsing function parameter. Trust levels are defined by what input data must not be allowed to do, as follows:

* 3 : (no restrictions)
* 2 : access data outside itself
* 1 : run javascript code
* 0 : cause excessive memory or time usage
* -1 : avoid schemas being applied

### interface

To get a javascript object from a set of MON files:

    import { loadMON } from './monTool.js';
    object = loadMON([filePath, params = {}]);

To get a javascript object from MON text:

    import { parseMON } from './monCore.js';
    object = parseMON(text, trust = 1);


## future plans

### logo / 紋章

Since the name is MON, maybe it could use a logo like [this](https://en.wikipedia.org/wiki/File:Family_crest_hanawachigai.png).




