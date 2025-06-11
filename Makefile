MAKEFLAGS += --no-builtin-rules
.SUFFIXES:

dist:dist/autovr-*-any.whl

dist/autovr-*-any.whl:
	cd ts && $(MAKE) frida
	python3 setup.py bdist_wheel

clean:
	cd ts && $(MAKE) clean
	rm -rf build
	rm -rf dist

.DEFAULT_GOAL := dist
.PHONY: clean
