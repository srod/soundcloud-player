module.exports = function(grunt) {
    'use strict';

    require('time-grunt')(grunt);
    require('load-grunt-tasks')(grunt);

    grunt.initConfig({
        jshint: {
            dev: {
                src: ['soundcloud.js'],
                options: {
                    reporter: require('jshint-stylish'),
                    jshintrc: '.jshintrc'
                }
            }
        },

        uglify: {
            compile: {
                options: {
                    report: 'gzip',
                    compress: true
                },
                files: [{
                    src: ['src/soundcloud.js'],
                    dest: 'build/soundcloud.min.js'
                }]
            }
        }
    });

    grunt.registerTask('js', ['jshint:dev']);
    grunt.registerTask('build', ['jshint:dev', 'uglify']);
};