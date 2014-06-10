#!/usr/bin/nodejs

// --------------------
// -- Pre-requisites --
// --------------------

// From : http://ec.europa.eu/internat_market/consultations/2013/copyright-rules/index_en.htm
// Get : nonymous-not-registered_en.zip  anonymous-registered_en.zip  other-stakeholders_en.zip  registered_en.zip  réponsesAD.zip  users_en.zip
// mkdir Responses && cd Responses && cp ../*.zip Responses
// for for x in `ls *.zip`; do unzip $x; done;
// mkdir AD # because of RéponsesAD.zip
// mv *.doc *.pdf AD
// find . -name Thumbs.db -print 0 | xargs -0 rm Thumbs.db # get rid of useless Windows noise
// find . -type f > rep.json
// wc -l should display : 9586 rep.json
// vi rep.json
// 	:%s/^\(.*\)\/\(.*[)_-]\(..\)[.-_ ].*\)$/{ "path": "\1\/", "file_name": "\2", "lang": "\3"},/
// 	9556 line replacements in : { path: 'NOT REGISTERED/Users BIS/', file_name: 'Anonymous (1608) _fr.odt', lang: 'fr'},
// 	then, form the missing lines by hand until : 9586
// 	:%s/file_name": "\(.*\.\(...\)\)"/file_name": "\1", "format": "\2"/ 
// 	9366
// 	:%s/file_name": "\(.*\.\(....\)\)"/file_name": "\1", "format": "\2"/ 
// 	225 -> 9586 - (9366 + 225) = 4 errors 
// 	/format.*format -> replace to correct previous 4 errors
//	:%s/lang": "\(..\)"/lang": "\1", "id": "yyy"/
//	:let i=0 | g/id/s/yyy/\=i/ |let i=i+1	# in every line containing 'id', replace 'yyy' by incremented i
// 	122 langs, a lot of errors giving .o or .d as the language, because of badly parsed _XX-.doc or .odt
// 	remove by hand from 122 langs to 38 at each non existing language
// 	lowercase all langs :%s/"lang": "\(..\)"/"lang": "\L\1"/
// 	down to 28
// mv "NOT REGISTERED/Other/Anonymous (308) _en.doc" "NOT REGISTERED/Other/Anonymous (308) _en.docx"	# update rep.json accordingly
// mv "NOT REGISTERED/Users/Anonymous (2154)_de.doc" "NOT REGISTERED/Users/Anonymous (2154)_de.odt"
// mv "NOT REGISTERED/Users/Anonymous (2059)_de.doc" "NOT REGISTERED/Users/Anonymous (2059)_de.docx"
// mv "NOT REGISTERED/Users/Anonymous (2072)_de.doc" "NOT REGISTERED/Users/Anonymous (2072)_de.docx"
// mv "NOT REGISTERED/Users/Anonymous (1790)_en.doc" "NOT REGISTERED/Users/Anonymous (1790)_en.docx"
// mv "others/dr-ohg-sparrow_en.doc" "others/dr-ohg-sparrow_en.rtf"
// mv "users/konicek_cs.doc" "users/konicek_cs.docx"
// mv "users/xabier-o_es.doc" "users/xabier-o_es.odt"
// mv "users/wood.b_en.doc" "users/wood.b_en.odt"
// mv "users/schmidt_de.doc" "users/schmidt_de.odt"
// mv "users/jung_de.doc" "users/jung_de.odt"
// mv "registered/cmos/~\$FRO_EN.doc" registered/cmos/FRO_EN.doc
// mv "users/\$how_en.odt" users/how_en.odt
// mv "authors/van-ommen_nl.doc" "authors/van-ommen_nl.docx"
// rm "users/~\$Rausch_DE.odt"	# it is an empty RTF file anyway
// 
// users/vasile_en.odt must be repaired

var util = require('util'),
    fs = require ('fs'),
    exec = require ('child_process').exec;


function puts (a) { util.puts (a) }
function usage () {
	var u = "Usage : "+process.argv[1]+" path/to/rep.json cmd\n";
	u += "cmd can be one of : \n";
	u += "\tlist_json_length : to display the number of elements of rep.json\n";
	u += "\tlang : to display each lang attributes found in rep.json and the number of occurences\n";
	u += "\tformat : idem with format attribute\n";
	u += "\tline_nb : idem with line_nb attribute\n";
	u += "\tlist_empty_files : list all responses names with no or empty corresponding .txt Response file\n";
	u += "\tconsolidate_text : for each missing or empty .txt file try to generate one\n";
	u += "\thelp : display this message\n";
	u += "\n";
	return u;
}

console.assert (process.argv.length == 4, "Missing argument(s).\nUsage : "+usage ());

var rep_json_file = process.argv [2],
    cmd = process.argv [3],
    rep_json = JSON.parse (fs.readFileSync (rep_json_file));

do_cmd ();

function do_cmd () {
	switch (cmd) {
		case 'list_json_length':
			puts (rep_json_file+' '+cmd+' : '+rep_json.length);
		break;
		case 'lang':
		case 'format':
		case 'line_nb':
			var attrs = {};
			var a, t = 0;

			for (var i = rep_json.length; i--;) {
				f = attrs [rep_json [i][cmd]];
				attrs [rep_json [i][cmd]] = typeof (f) != 'undefined' ? f + 1 : 1;
			}

			puts (Object.keys (attrs).length+' '+cmd+' : ');

			for (var e in attrs) {
				if (attrs.hasOwnProperty (e)) {
					puts ('   "'+e+'" : '+attrs[e]);
					t += attrs [e];
				}
			}

			puts ('total : '+t);
		break;
		case 'list_empty_files':
			var empts = [];
			var r;

			for (var i=rep_json.length; i--;) {
				r = rep_json[i];

				if (r.line_nb == 1) {
					puts (r.path+r.file_name+' id '+r.id+' is empty');
					empts.push (r);
				}
			}

			puts ('total '+empts.length);			
		break;
		case 'consolidate_text':
			const text_conv = {
				pdf: "pdftotext -layout", // pdf : pdftotext -layout path/to/file -
				doc: "antiword -s",
				odt : "odt2txt",
				rtf : "unrtf --text",
				docx : "docx2txt", //	docx : docx2txt path/to/file.docx -
				msg : "ls",
				txt : "ls"
			},
			batch_size = 5,
			cur_batch = [];
			puts ('start consolidating texts in '+new Date ().toLocaleString ());

			var do_one_batch = function (a, b) {
				var r, cmd_text_conv, file_name, file_content;

				var f = function (i) {
					r = rep_json [i];
					file_name = r.id+'.txt';
					puts (file_name);

					if (fs.existsSync (file_name)) {
						file_content = fs.readFileSync (file_name);

						if (typeof (r.line_nb) == 'undefined') {
							//puts ('no line_nb');
							r.line_nb = file_content.toString().split (/(\r\n|\n|\r)/).length;
						}
						
						if (r.line_nb != 1) {
							//puts ('avoid not empty file');
							cur_batch[i] = 1;
							is_batch_terminated (a, b);
							return;
						}
					}

					switch (r.format) {
						case 'odt': case 'doc': case 'msg': case 'rtf': case 'txt':
							cmd_text_conv = text_conv[r.format]+' "'+r.path+r.file_name+'"';
						break;
						case 'docx': case 'pdf':
							cmd_text_conv = text_conv[r.format]+' "'+r.path+r.file_name+'" -';
						break;
						default:
							console.assert(false, 'I don\'t know "'+r.format+'" format."');
						break;
					}

					// puts ('launch '+cmd_text_conv);
					exec (cmd_text_conv, function (err, stdo, stde) {
						// puts ('i '+i);

						if (!err && !stdo && !stde) {
							err = 'No output at all for '+rep_json[i].id;
						}
						
						var res = stdo ? stdo : stde;

						if (err) {
							puts ('err '+cmd_text_conv+' '+err+' stde '+stde);
							res = err;
						}

						rep_json[i].line_nb = res.toString ().split (/(\r\n|\n|\r)/).length;
						fs.writeFileSync (rep_json[i].id+'.txt', res);
						cur_batch[i] = 1;
						is_batch_terminated (a, b);
					});
				}
				for (var i = a; i < b; i++) {
					f (i);
				}
			},
			is_batch_terminated = function (a, b) {
				var s = 0, new_a, new_b;

				for (var j = a; j < b; j++) {
					if (typeof (cur_batch[j]) != "undefined") {
						s = s + 1;
					}
				}

				// puts ('s '+s);
				if (s == batch_size) {
					// puts ('yes s == batch_size b ='+b+' and rep_json.length '+rep_json.length);
					if (b <= (rep_json.length - batch_size)) {
						new_a = b;
						new_b = b + batch_size;
					} else {
						if (b == rep_json.length - 1) {
							// it's finished
							// but don't wait that to write results
							// fs.writeFile(new Date ().toLocaleString ()+'txt_rep.json', JSON.stringify (rep_json), function (err) { if (err) throw err; console.log('It\'s saved!'); });
							fs.writeFileSync (new Date ().toLocaleString ()+' rep.json', JSON.stringify (rep_json));
							puts ('terminated at '+new Date().toLocaleString ());
						} else {
							new_a = b;
							new_b = rep_json.length;
						}
					}
					do_one_batch (new_a, new_b);
				}
			};

			do_one_batch (0, batch_size);
		break;
		case 'help':
			puts (usage());
		break;
		default:
			puts ('Unrecognized command');
		break;
	}
}
