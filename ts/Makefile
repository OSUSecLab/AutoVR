MAKEFLAGS += --no-builtin-rules
NPM_PACKAGE = autovr-ts-*.tgz

ifdef OS
   RM = rm -rf
   RMDIR = rm -rf
   TOUCH = touch
   FixPath = $(subst /,\,$1)
else
   RM = rm -rf
   RMDIR = rm -rf
   TOUCH = touch
   FixPath = $1
endif

.SUFFIXES:

frida:index.out.js

index.out.js:dist
	$(call FixPath,./node_modules/.bin/frida-compile) -o index.out.js --no-source-maps autovr.ts

dist:$(NPM_PACKAGE)
	@ $(TOUCH) -m dist

$(NPM_PACKAGE):dist\index.d.ts
	npm pack

dist\index.d.ts:
	npm install --save-dev rollup typescript rollup-plugin-dts
	$(call FixPath,./node_modules/.bin/tsc) --build --verbose
	$(call FixPath,./node_modules/.bin/rollup) -c

node_modules:
	npm i
	@ $(TOUCH) -m node_modules

clean:
	$(RMDIR) dist
	$(RM) index.out.js
	$(RM) autovr-ts.*.tgz

.DEFAULT_GOAL := dist
.PHONY: clean
