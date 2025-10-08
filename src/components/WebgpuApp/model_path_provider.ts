import axios from 'axios';

import path from 'path';

class gltfModelPathProvider
{
    modelIndexerPath: string;
    ignoredVariants: string[];
    modelsDictionary: any;
    constructor(modelIndexerPath: string, currentFalvour="glTF", ignoredVariants = ["glTF-Embedded"])
    {
        this.modelIndexerPath = modelIndexerPath;
        this.ignoredVariants = ignoredVariants;
        this.modelsDictionary = undefined;
    }

    async initialize()
    {
        const self = this;
        return axios.get(this.modelIndexerPath).then(response =>
        {
            self.populateDictionary(response.data);
        });
    }

    resolve(modelKey: string, flavour: string)
    {
        return this.modelsDictionary[modelKey][flavour];
    }

    getAllKeys()
    {
        return Object.keys(this.modelsDictionary);
    }

    populateDictionary(modelIndexer: any[])
    {
        const modelsFolder = path.dirname(this.modelIndexerPath);
        this.modelsDictionary = {};
        for (const entry of modelIndexer)
        {
            // TODO maybe handle undefined names better
            if (entry.variants === undefined || entry.name === undefined)
            {
                continue;
            }

            let variants: {[index: string] : string} = {};

            for (const variant of Object.keys(entry.variants))
            {
                if (this.ignoredVariants.includes(variant))
                {
                    continue;
                }

                const fileName = entry.variants[variant];
                const modelPath = path.join(modelsFolder, entry.name, variant, fileName);
                variants[variant] = modelPath;

            }
            this.modelsDictionary[entry.name] = variants;
        }
    }

    getModelFlavours(modelName: string)
    {
        if(this.modelsDictionary[modelName] === undefined)
        {
            return ["glTF"];
        }
        return Object.keys(this.modelsDictionary[modelName]);
    }
}

function fillEnvironmentWithPaths(environmentNames: {[index: string] : any}, environmentsBasePath: string)
{
    Object.keys(environmentNames).map(function(name, index) {
        const title = environmentNames[name];
        environmentNames[name] = {
            index: index,
            title: title,
            hdr_path: environmentsBasePath + name + ".hdr",
            jpg_path: environmentsBasePath + name + ".jpg"
        };
    });
    return environmentNames;
}

export { gltfModelPathProvider, fillEnvironmentWithPaths };
