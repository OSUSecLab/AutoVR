MAKEFLAGS += --no-builtin-rules
.SUFFIXES:

frida:dist
	@ ./node_modules/.bin/frida-compile -o ../index.out.js --no-source-maps autovr.ts

dist:node_modules
	@ npm install --save-dev rollup typescript rollup-plugin-dts
	@ ./node_modules/.bin/tsc --build --verbose
	@ ./node_modules/.bin/rollup -c
	@ touch -m dist
	@ npm pack

node_modules:
	@ npm i
	@ touch -m node_modules

clean:
	@ rm -rf dist
	@ rm -f ../index.ogoout.js
	@ rm -rf autovr-ts.*.tgz

.DEFAULT_GOAL := dist
.PHONY: clean
