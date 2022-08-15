export const removeEmptyFields = ({ data, passKey, files }) => {
    // console.log(`🚀 ~ removeEmptyFields ~ files`, files);
    let modified;
    if (typeof data === `object` && data !== null) {
        modified = {};
        if (Array.isArray(data)) {
            modified = [];
            for (const element of data) {
                modified.push(removeEmptyFields({ data: element, passKey, files }));
            }
        } else {
            for (const key of Object.keys(data)) {
                if (data[key] === `` && key !== `publishedAt`) {
                    continue;
                }
                modified[key] = removeEmptyFields({
                    data: data[key],
                    passKey: `${passKey ? `${passKey}.` : ``}${key}`,
                    files,
                });
            }
        }
    } else {
        modified = data;
    }
    return modified;
};

export const appendFilesToFormData = (formData, files) => {
    // console.log(`🚀 ~ appendFilesToFormData ~ formData`, formData);
    if (Object.keys(files).length) {
        for (const key of Object.keys(files)) {
            // console.log(`🚀 ~ key`, key);
            if (Array.isArray(files[key])) {
                for (const [_, file] of files[key].entries()) {
                    // console.log(`🚀 ~ file`, file, files[key]);
                    formData.append(`files.${key}`, file);
                }
            } else {
                // console.log(`🚀 ~ appendFilesToFormData ~ key`, key);
                // console.log(`🚀 ~ file`, file, files[key]);
                formData.append(`files.${key}`, files[key]);
            }
        }
    }
};
